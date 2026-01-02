---
name: upload-to-r2
description: Upload release DMG files to Cloudflare R2 storage. This skill should be used when the user requests uploading DMG files to R2, after building a new release, or when updating download links for the website. Automatically detects version from package.json and uploads both arm64 and x64 DMG files using AWS S3-compatible API with proper authentication.
---

# Upload to R2

Upload CLI Manager release DMG files to Cloudflare R2 storage using secure environment-based credentials.

## When to Use This Skill

Use this skill when:
- The user requests uploading DMG files to R2 storage
- A new release has been built and needs to be distributed
- Updating download links for the website requires new file uploads
- The user mentions "R2", "upload release", or "publish DMG files"

## Prerequisites

### R2 Credentials

R2 credentials are hardcoded in the script for personal use. The configuration includes:
- Account ID
- Bucket name
- Access key ID
- Secret access key

**Note**: This skill is designed for personal use only. Credentials are stored directly in the script file.

### Version Detection and File Validation

The script performs the following validations:
1. **Version detection**: Automatically reads version from `package.json` (or accepts version as CLI argument)
2. **File validation**: Verifies both DMG files exist in `release/` directory before uploading:
   - `cli-manager-{version}-x64.dmg`
   - `cli-manager-{version}-arm64.dmg`

If either file is missing, the script exits with a clear error message.

## How to Use

### Basic Usage (Auto-detect version)

Execute the upload script from the project root:

```bash
node .claude/skills/upload-to-r2/scripts/upload-to-r2.js
```

The script will:
1. Validate all required environment variables are set
2. Read the version from `package.json`
3. Locate DMG files in `release/` directory
4. Upload both arm64 and x64 DMG files to R2
5. Display upload progress and final URLs

### Manual Version Override

To upload a specific version instead of auto-detecting:

```bash
node .claude/skills/upload-to-r2/scripts/upload-to-r2.js 1.2.0
```

## Implementation Details

### AWS Signature V4 Authentication

The script implements AWS Signature V4 authentication to securely upload files to Cloudflare R2's S3-compatible API. This ensures:
- Secure credential transmission
- Request integrity verification
- Protection against replay attacks

### Upload Process

For each DMG file:
1. Calculate file size and SHA-256 hash
2. Generate AWS Signature V4 authorization header
3. Send HTTPS PUT request with file data
4. Verify successful upload (HTTP 200 response)
5. Display the public R2 URL

### Error Handling

The script validates:
- All environment variables are set before starting
- DMG files exist in the expected location
- Upload responses are successful (HTTP 200)

If any validation fails, the script exits with a clear error message indicating what needs to be fixed.

## Expected Output

Successful upload example:

```
🚀 Starting R2 upload...

Auto-detected version from package.json: 1.1.1
✅ Validated: Both DMG files exist for version 1.1.1

Bucket: solhun-downloads
Files to upload: 2

Uploading cli-manager-1.1.1-x64.dmg (117.70 MB)...
✅ cli-manager-1.1.1-x64.dmg uploaded successfully!
   URL: https://4521ed2f6bd35977301d9344ffcbbc8e.r2.cloudflarestorage.com/solhun-downloads/cli-manager-1.1.1-x64.dmg

Uploading cli-manager-1.1.1-arm64.dmg (111.15 MB)...
✅ cli-manager-1.1.1-arm64.dmg uploaded successfully!
   URL: https://4521ed2f6bd35977301d9344ffcbbc8e.r2.cloudflarestorage.com/solhun-downloads/cli-manager-1.1.1-arm64.dmg

🎉 All files uploaded successfully!
```

## Security Notes

This skill is designed for **personal use only**:
1. **Credentials hardcoded**: R2 credentials are stored directly in the script for convenience
2. **Project-level skill**: Located in `.claude/skills/` which is not committed to production code
3. **Minimal permissions**: R2 API token has "Object Read & Write" permissions scoped to solhun-downloads bucket only
4. **Rotate credentials**: Update R2 API tokens periodically for security

## Related Workflows

After uploading to R2, typically:
1. Update download links in the website repository (solhun-web-page)
2. Verify files are accessible via public R2 URLs
3. Test download functionality on the production website

## Troubleshooting

### DMG files not found

```
❌ DMG files for version 1.1.1 not found in release directory:
   - cli-manager-1.1.1-x64.dmg
   - cli-manager-1.1.1-arm64.dmg

Please build the release first or check the version number.
```

**Solution**:
1. Ensure the release build completed successfully: `pnpm build:mac` or `pnpm publish:mac`
2. Check that DMG files exist in `release/` directory
3. Verify the version in `package.json` matches the built files

### package.json not found

```
❌ package.json not found. Please provide version as argument:
   node .claude/skills/upload-to-r2/scripts/upload-to-r2.js 1.1.1
```

**Solution**: Run the script from the project root directory, or provide version as argument.

### Upload failed with status 403

**Solution**: R2 API credentials may be invalid or expired. Update credentials in the script.

### Upload failed with status 404

**Solution**: Verify the R2 bucket name is correct and exists in your Cloudflare account.
