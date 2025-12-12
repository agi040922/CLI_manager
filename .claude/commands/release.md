---
description: 버전 업데이트, 빌드, GitHub 릴리즈 생성
---

# Release: Version Bump, Build, and Publish

1. Read current version from package.json
2. Ask user for new version number (e.g., 1.0.17)
3. Update version in package.json
4. Run `pnpm build:mac` to build signed macOS app
5. Create GitHub release with `gh release create v{version}`
   - Upload: release/cli-manager-{version}-*.{dmg,zip} and latest-mac.yml
   - Generate release notes with --generate-notes
6. Confirm release URL and auto-update readiness
