#!/bin/sh
# Install as .git/hooks/pre-commit and make it executable.
# Pin jev-pref to a project-approved version in shared repositories.
npx jev-pref review --staged --files
