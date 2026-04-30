#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [ -z "$FILE_PATH" ]; then exit 0; fi
BASENAME=$(basename "$FILE_PATH")
PROTECTED_PATTERNS=(".env" ".env.local" ".env.production" ".env.staging" "credentials" "secrets")
for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$BASENAME" == *"$pattern"* ]]; then
    echo "BLOCKED: Cannot write to '$FILE_PATH' -- matches protected pattern '$pattern'." >&2
    exit 2
  fi
done
exit 0
