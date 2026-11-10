# Kanti

Everything built for the Kanti Ayurvedic skincare project, in one folder.

```
kanti/
├── CLAUDE.md                        ← project context (Claude Code reads this automatically)
├── KANTI-ENHANCEMENT-BACKLOG.md     ← roadmap + next tasks
├── prototype/kanti-prototype.html   ← the design prototype (open in a browser)
├── backend/                         ← the real full-stack app — see backend/README.md to run it
└── deliverables/Kanti-Work-In-Progress.pptx
```

## Continuing in Claude Code

1. **Install Claude Code** (official docs: https://docs.claude.com/en/docs/claude-code/overview).
   The recommended installer:
   - macOS / Linux: `curl -fsSL https://claude.ai/install.sh | bash`
   - Windows (PowerShell): `irm https://claude.ai/install.ps1 | iex`
   - (The old `npm install -g @anthropic-ai/claude-code` still works but is deprecated.)

2. **Open this folder** in your terminal and start Claude Code:
   ```bash
   cd kanti
   claude
   ```
   Claude Code reads `CLAUDE.md` on start, so it will already know the project, the conventions,
   and what to do next — no need to re-explain this whole chat.

3. **Good first prompts** inside Claude Code:
   - "Read CLAUDE.md and the backlog, then run the backend and confirm it works."
   - "Do task **B2** from the backlog: wire the storefront prototype to the backend API."
   - "Build backlog item **E7** (seasonal ritucharya) in the prototype."

## Run the prototype now
Open `prototype/kanti-prototype.html` in any browser.

## Run the backend
See `backend/README.md` — in short: `cd backend && npm install && cp .env.example .env && npm start`,
then open http://localhost:3000.

> Keep secrets (like a Gemini API key) only in `backend/.env`. Never commit that file or put a key in
> any `public/` file.
