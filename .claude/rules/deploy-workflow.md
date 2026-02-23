# Deploy Workflow

When the user runs `/github:commit` and explicitly requests deployment:

1. Run `/release` with **patch** version bump (most minor)
2. Run `/solhun:changelog`

This workflow only triggers when the user explicitly says to deploy (e.g., "deploy", "release too", "publish").
