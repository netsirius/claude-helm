use serde::Serialize;
use tauri::State;

use crate::ssh::commands::exec_command;
use crate::state::AppState;

use super::helpers::get_handle;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStats {
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_creation_tokens: u64,
    pub total_cache_read_tokens: u64,
    pub estimated_cost_usd: f64,
    pub cache_hit_rate: f64,
    pub session_count: u32,
    pub model_distribution: Vec<ModelUsage>,
    pub daily_usage: Vec<DailyUsage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub model: String,
    pub tokens: u64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    pub date: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapData {
    pub cells: Vec<HeatmapCell>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapCell {
    pub day: u8,
    pub hour: u8,
    pub count: u32,
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// Aggregate token usage across all Claude Code sessions on a remote machine.
///
/// Reads JSONL session files from `~/.claude/projects/` (last 30 days),
/// extracts usage fields from assistant messages, and computes totals,
/// cost estimates, cache hit rates, model distribution, and daily breakdown.
#[tauri::command]
pub async fn get_remote_usage_stats(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<UsageStats, String> {
    let handle = get_handle(&state, &remote_id).await?;

    // Remote script: extract usage + model data from JSONL files modified in last 30 days.
    // Each output line is: DATE<TAB>MODEL<TAB>input<TAB>output<TAB>cache_create<TAB>cache_read
    // We use python3 for reliable JSON parsing since jq may not be installed.
    let script = r#"python3 -c "
import json, glob, os, sys, time

cutoff = time.time() - 30*86400
lines = []

for path in glob.glob(os.path.expanduser('~/.claude/projects/*/sessions/*.jsonl')):
    try:
        if os.path.getmtime(path) < cutoff:
            continue
    except OSError:
        continue
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if obj.get('type') != 'assistant':
                    continue
                msg = obj.get('message', {})
                usage = msg.get('usage')
                if not usage:
                    continue
                model = msg.get('model', 'unknown')
                ts = obj.get('timestamp', '')
                date = ts[:10] if len(ts) >= 10 else 'unknown'
                inp = usage.get('input_tokens', 0)
                out = usage.get('output_tokens', 0)
                cc = usage.get('cache_creation_input_tokens', 0)
                cr = usage.get('cache_read_input_tokens', 0)
                print(f'{date}\t{model}\t{inp}\t{out}\t{cc}\t{cr}')
    except (IOError, OSError):
        continue
" 2>/dev/null"#;

    let result = exec_command(&handle, script).await?;

    // Also count session files for session_count
    let session_count_result = exec_command(
        &handle,
        "find ~/.claude/projects -name '*.jsonl' -mtime -30 2>/dev/null | wc -l",
    )
    .await?;

    let session_count: u32 = session_count_result
        .stdout
        .trim()
        .parse()
        .unwrap_or(0);

    // Parse the output lines
    let mut total_input: u64 = 0;
    let mut total_output: u64 = 0;
    let mut total_cache_creation: u64 = 0;
    let mut total_cache_read: u64 = 0;

    // Model tracking: model_name -> total tokens
    let mut model_tokens: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    // Daily tracking: date -> (input, output)
    let mut daily_map: std::collections::BTreeMap<String, (u64, u64)> =
        std::collections::BTreeMap::new();

    for line in result.stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 6 {
            continue;
        }

        let date = parts[0];
        let model = parts[1];
        let input: u64 = parts[2].parse().unwrap_or(0);
        let output: u64 = parts[3].parse().unwrap_or(0);
        let cache_create: u64 = parts[4].parse().unwrap_or(0);
        let cache_read: u64 = parts[5].parse().unwrap_or(0);

        total_input += input;
        total_output += output;
        total_cache_creation += cache_create;
        total_cache_read += cache_read;

        *model_tokens.entry(model.to_string()).or_insert(0) += input + output;

        let entry = daily_map.entry(date.to_string()).or_insert((0, 0));
        entry.0 += input;
        entry.1 += output;
    }

    // Compute cost estimate based on model
    let estimated_cost_usd = estimate_cost(&model_tokens, total_input, total_output, total_cache_creation, total_cache_read);

    // Cache hit rate: cache_read / (cache_read + non-cached input)
    let total_cacheable = total_cache_read + total_cache_creation + total_input;
    let cache_hit_rate = if total_cacheable > 0 {
        (total_cache_read as f64 / total_cacheable as f64) * 100.0
    } else {
        0.0
    };

    // Model distribution
    let total_model_tokens: u64 = model_tokens.values().sum();
    let mut model_distribution: Vec<ModelUsage> = model_tokens
        .into_iter()
        .map(|(model, tokens)| {
            let percentage = if total_model_tokens > 0 {
                (tokens as f64 / total_model_tokens as f64) * 100.0
            } else {
                0.0
            };
            ModelUsage {
                model,
                tokens,
                percentage,
            }
        })
        .collect();
    model_distribution.sort_by(|a, b| b.tokens.cmp(&a.tokens));

    // Daily usage (last 14 days)
    let daily_usage: Vec<DailyUsage> = daily_map
        .into_iter()
        .rev()
        .take(14)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|(date, (input, output))| {
            let cost = estimate_daily_cost(input, output);
            DailyUsage {
                date,
                input_tokens: input,
                output_tokens: output,
                cost_usd: cost,
            }
        })
        .collect();

    Ok(UsageStats {
        total_input_tokens: total_input,
        total_output_tokens: total_output,
        total_cache_creation_tokens: total_cache_creation,
        total_cache_read_tokens: total_cache_read,
        estimated_cost_usd,
        cache_hit_rate,
        session_count,
        model_distribution,
        daily_usage,
    })
}

/// Get session activity heatmap data for a remote machine.
///
/// Parses session start timestamps from JSONL files (first entry per file)
/// and buckets them into a 7-day x 24-hour grid.
#[tauri::command]
pub async fn get_session_heatmap(
    state: State<'_, AppState>,
    remote_id: String,
) -> Result<HeatmapData, String> {
    let handle = get_handle(&state, &remote_id).await?;

    // Extract first timestamp from each JSONL file (session start time).
    // Output: one line per file with "day_of_week<TAB>hour" (0=Mon, 6=Sun).
    let script = r#"python3 -c "
import json, glob, os, sys
from datetime import datetime

for path in glob.glob(os.path.expanduser('~/.claude/projects/*/sessions/*.jsonl')):
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                ts = obj.get('timestamp', '')
                if len(ts) >= 19:
                    try:
                        dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                        # day: 0=Mon, 6=Sun
                        print(f'{dt.weekday()}\t{dt.hour}')
                    except (ValueError, TypeError):
                        pass
                break
    except (IOError, OSError):
        continue
" 2>/dev/null"#;

    let result = exec_command(&handle, script).await?;

    // Initialize 7x24 grid
    let mut grid = [[0u32; 24]; 7];

    for line in result.stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 2 {
            continue;
        }
        let day: usize = match parts[0].parse() {
            Ok(d) if d < 7 => d,
            _ => continue,
        };
        let hour: usize = match parts[1].parse() {
            Ok(h) if h < 24 => h,
            _ => continue,
        };
        grid[day][hour] += 1;
    }

    let mut cells = Vec::with_capacity(168);
    for day in 0..7u8 {
        for hour in 0..24u8 {
            cells.push(HeatmapCell {
                day,
                hour,
                count: grid[day as usize][hour as usize],
            });
        }
    }

    Ok(HeatmapData { cells })
}

// ─── Cost estimation helpers ─────────────────────────────────────────────────

/// Estimate total cost based on model distribution and token counts.
///
/// Pricing (per million tokens):
/// - Sonnet: $3 input, $15 output
/// - Opus:   $15 input, $75 output
/// - Haiku:  $0.25 input, $1.25 output
/// - Cache read:     90% discount on input price
/// - Cache creation: 25% premium on input price
fn estimate_cost(
    model_tokens: &std::collections::HashMap<String, u64>,
    total_input: u64,
    total_output: u64,
    cache_creation: u64,
    cache_read: u64,
) -> f64 {
    // Determine dominant model for pricing
    let dominant_model = model_tokens
        .iter()
        .max_by_key(|(_, &v)| v)
        .map(|(k, _)| k.to_lowercase())
        .unwrap_or_default();

    let (input_rate, output_rate) = if dominant_model.contains("opus") {
        (15.0, 75.0)
    } else if dominant_model.contains("haiku") {
        (0.25, 1.25)
    } else {
        // Default to Sonnet pricing
        (3.0, 15.0)
    };

    let mtok = 1_000_000.0;

    let input_cost = (total_input as f64 / mtok) * input_rate;
    let output_cost = (total_output as f64 / mtok) * output_rate;
    let cache_creation_cost = (cache_creation as f64 / mtok) * input_rate * 1.25;
    let cache_read_cost = (cache_read as f64 / mtok) * input_rate * 0.10;

    // Round to 2 decimal places
    let total = input_cost + output_cost + cache_creation_cost + cache_read_cost;
    (total * 100.0).round() / 100.0
}

/// Estimate daily cost using Sonnet pricing as default.
fn estimate_daily_cost(input: u64, output: u64) -> f64 {
    let mtok = 1_000_000.0;
    let cost = (input as f64 / mtok) * 3.0 + (output as f64 / mtok) * 15.0;
    (cost * 100.0).round() / 100.0
}
