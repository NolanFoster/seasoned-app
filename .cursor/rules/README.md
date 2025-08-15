# Cursor Rules

This directory contains project-specific rules for Cursor AI, following the latest guidelines from the [Cursor documentation](https://docs.cursor.com/context/rules).

## Structure

Each rule is stored as an individual MDC (Markdown with metadata) file containing:
- **Metadata header**: Defines how and when the rule is applied
- **Content**: The actual rule instructions

## Current Rules

### 1. Testing and Deployment Workflow (`testing-deployment.mdc`)
- **Type**: `always` - Applied to all operations
- **Priority**: 1
- **Purpose**: Ensures proper testing and deployment practices
- Covers: Test requirements, staging workflow, pre-commit checklist

### 2. Code Quality Standards (`code-quality.mdc`)
- **Type**: `always` - Applied to all operations
- **Priority**: 2
- **Purpose**: Maintains consistent code quality
- Covers: Error handling, documentation, commit standards

### 3. Automated Workflows (`automated-workflows.mdc`)
- **Type**: `agent-requested` - AI decides when to apply
- **Priority**: 3
- **Purpose**: Suggests CI/CD and testing improvements
- Covers: GitHub Actions, testing strategies

## Rule Types

- **`always`**: Included in every operation
- **`auto-attached`**: Applied when matching files are referenced
- **`agent-requested`**: AI decides whether to include it
- **`manual`**: Only included when explicitly mentioned with `@ruleName`

## Migration Notes

These rules were migrated from the legacy `.cursorrules` file in the project root to follow the new `.cursor/rules` structure for better organization and control.