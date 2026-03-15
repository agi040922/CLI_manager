# Deploy Workflow

When the user runs `/github:commit` and explicitly requests deployment:

1. Run `/release` with **patch** version bump (most minor)
2. Run `/solhun:changelog`
3. Run `/upload-to-r2` to upload DMG files to Cloudflare R2
4. Update download links in `~/Downloads/solhun-web-page` (4 files: `app/page.tsx`, `components/cta-section.tsx`, `components/site-header.tsx`, `components/pricing-section.tsx`) and commit & push

This workflow only triggers when the user explicitly says to deploy (e.g., "deploy", "release too", "publish").
