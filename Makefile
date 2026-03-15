.PHONY: dev build release install clean check test lint fmt help setup dmg open kill logs reset-config

# ─── Development ──────────────────────────────────────────────

dev: ## Start dev mode (hot reload frontend + Rust backend)
	pnpm tauri dev

dev-frontend: ## Start only the Vite dev server (no Tauri)
	pnpm dev

# ─── Build ────────────────────────────────────────────────────

build: ## Build production binary + app bundle
	pnpm tauri build

build-debug: ## Build debug binary (faster, larger)
	pnpm tauri build --debug

build-frontend: ## Build only frontend (TypeScript + Vite)
	pnpm build

build-rust: ## Build only Rust backend
	cd src-tauri && cargo build --release

# ─── Checks ───────────────────────────────────────────────────

check: ## Check both Rust and TypeScript compile
	@echo "── Rust ──"
	cd src-tauri && cargo check
	@echo "── TypeScript ──"
	pnpm build
	@echo "✓ All checks passed"

check-rust: ## Check only Rust compilation
	cd src-tauri && cargo check

check-ts: ## Check only TypeScript compilation
	pnpm exec tsc --noEmit

test: ## Run Rust tests
	cd src-tauri && cargo test

test-verbose: ## Run Rust tests with output
	cd src-tauri && cargo test -- --nocapture

# ─── Code Quality ─────────────────────────────────────────────

fmt: ## Format Rust code
	cd src-tauri && cargo fmt

fmt-check: ## Check Rust formatting
	cd src-tauri && cargo fmt -- --check

lint: ## Run Rust clippy linter
	cd src-tauri && cargo clippy -- -W clippy::all

lint-fix: ## Fix auto-fixable Rust lint issues
	cd src-tauri && cargo clippy --fix --allow-dirty -- -W clippy::all

# ─── Install & Release ────────────────────────────────────────

setup: ## Install all dependencies (first time setup)
	pnpm install
	cd src-tauri && cargo fetch
	@echo "✓ Dependencies installed"

dmg: build ## Build and locate the DMG
	@ls -lh src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || echo "No DMG found"

install: build ## Install the app to /Applications
	@if [ -d "src-tauri/target/release/bundle/macos/Claude Helm.app" ]; then \
		cp -rf "src-tauri/target/release/bundle/macos/Claude Helm.app" /Applications/; \
		echo "✓ Installed to /Applications/Claude Helm.app"; \
	else \
		echo "✗ App bundle not found. Run 'make build' first."; \
	fi

uninstall: ## Remove the app from /Applications
	rm -rf "/Applications/Claude Helm.app"
	@echo "✓ Uninstalled"

# ─── Run ──────────────────────────────────────────────────────

open: ## Open the built app (without rebuilding)
	@if [ -d "src-tauri/target/release/bundle/macos/Claude Helm.app" ]; then \
		open "src-tauri/target/release/bundle/macos/Claude Helm.app"; \
	elif [ -d "/Applications/Claude Helm.app" ]; then \
		open "/Applications/Claude Helm.app"; \
	else \
		echo "✗ App not found. Run 'make build' first."; \
	fi

kill: ## Force quit the running app
	pkill -f "Claude Helm" 2>/dev/null || pkill -f "claude-helm" 2>/dev/null || echo "Not running"

# ─── Clean ────────────────────────────────────────────────────

clean: ## Remove build artifacts
	cd src-tauri && cargo clean
	rm -rf dist node_modules/.vite
	@echo "✓ Cleaned"

clean-all: clean ## Remove build artifacts + node_modules
	rm -rf node_modules
	@echo "✓ Full clean done. Run 'make setup' to reinstall."

# ─── Config ───────────────────────────────────────────────────

config-dir: ## Show config directory path and contents
	@echo "Config dir: ~/.claude-manager/"
	@ls -la ~/.claude-manager/ 2>/dev/null || echo "(not created yet — run the app first)"

reset-config: ## Reset all app configuration (DESTRUCTIVE)
	@echo "This will delete ALL VPS, agent, and pipeline configs."
	@read -p "Are you sure? (y/N) " confirm && [ "$$confirm" = "y" ] && \
		rm -rf ~/.claude-manager/ && echo "✓ Config reset" || echo "Cancelled"

logs: ## Show recent app logs
	@tail -50 ~/.claude-manager/*.log 2>/dev/null || echo "No logs found"

# ─── Info ─────────────────────────────────────────────────────

info: ## Show project info and versions
	@echo "Claude Helm v$$(grep '"version"' package.json | head -1 | sed 's/.*: "//;s/".*//')"
	@echo ""
	@echo "Stack:"
	@echo "  Node:    $$(node --version 2>/dev/null || echo 'not found')"
	@echo "  pnpm:    $$(pnpm --version 2>/dev/null || echo 'not found')"
	@echo "  Rust:    $$(rustc --version 2>/dev/null || echo 'not found')"
	@echo "  Cargo:   $$(cargo --version 2>/dev/null || echo 'not found')"
	@echo "  Tauri:   $$(pnpm tauri --version 2>/dev/null || echo 'not found')"
	@echo ""
	@echo "Files:"
	@echo "  Rust:    $$(find src-tauri/src -name '*.rs' | wc -l | tr -d ' ') files"
	@echo "  TS/TSX:  $$(find src -name '*.ts' -o -name '*.tsx' | wc -l | tr -d ' ') files"
	@echo ""
	@echo "Build:"
	@ls -lh src-tauri/target/release/claude-helm 2>/dev/null | awk '{print "  Binary: "$$5}' || echo "  Binary: not built"
	@ls -lh src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | awk '{print "  DMG:    "$$5}' || echo "  DMG:    not built"

# ─── Help ─────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
