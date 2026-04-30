# setup-renode

GitHub/Gitea Action to download, cache, and extract **Renode**. Zero external dependencies, cross-platform (Windows/Linux/macOS), works with Node 24+ and Bun.

## Features

- **Smart caching**: Archives cached by version, not URL — works with any download link
- **Cross-platform**: Built-in `tar` support on Windows 10+, Linux, macOS
- **Fast**: Skips download and extraction if cache hit
- **Configurable**: Custom cache directory, `strip-components`, version control
- **Zero dependencies**: Pure TypeScript, no `@actions/*` required

## Usage

```yaml
steps:
  - name: Setup Renode
    id: renode
    uses: your-org/setup-renode-action@v1
    with:
      version: '1.16.1'  # Renode version
      url: 'https://github.com/renode/renode/releases/download/v1.16.1/renode-1.16.1.linux-portable.tar.gz'
      cache-dir: '.renode-cache'  # optional, default: '.renode-cache'
      strip-components: '1'  # optional, default: '1'

  - name: Run Renode
    run: ${{ steps.renode.outputs.renode-path }}/renode --version
```

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `version` | ✅ | — | Renode version (e.g., `1.16.1`) |
| `url` | ✅ | — | Direct download URL for portable archive (`.zip` or `.tar.gz`) |
| `cache-dir` | ❌ | `.renode-cache` | Directory to store cached archives |
| `strip-components` | ❌ | `1` | Leading directories to remove during extraction |

## Outputs

| Name | Description |
|------|-------------|
| `renode-path` | Absolute path to extracted Renode directory |
| `cache-hit` | `true` if archive was already cached |
| `extracted` | `true` if extraction was performed in this run |

## Caching Strategy

The action caches **downloaded archives** (not extracted files):

```
.renode-cache/
├── renode-1.16.1.zip      # or .tar.gz — cached by version
├── renode-1.17.0.tar.gz
└── 1.16.1/                # extracted directory (not cached by CI)
```

**Recommended**: Use `actions/cache@v4` to persist `.renode-cache/*.zip` and `*.tar.gz` between workflow runs:

```yaml
- name: Cache Renode Archives
  uses: actions/cache@v4
  with:
    path: |
      .renode-cache/*.zip
      .renode-cache/*.tar.gz
    key: renode-${{ runner.os }}-${{ env.RENODE_VERSION }}
    restore-keys: renode-${{ runner.os }}-
```

## Example Workflow

```yaml
name: CI

on: [push, pull_request]

env:
  RENODE_VERSION: '1.16.1'

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-2025-vs2026]
    steps:
      - uses: actions/checkout@v4

      - name: Cache Renode
        uses: actions/cache@v4
        with:
          path: .renode-cache/*.zip,.renode-cache/*.tar.gz
          key: renode-${{ runner.os }}-${{ env.RENODE_VERSION }}

      - name: Setup Renode
        id: renode
        uses: your-org/setup-renode-action@v1
        with:
          version: ${{ env.RENODE_VERSION }}
          url: ${{ runner.os == 'Windows' 
            && 'https://github.com/renode/renode/releases/download/v${{ env.RENODE_VERSION }}/renode-${{ env.RENODE_VERSION }}.windows-portable-dotnet.zip'
            || 'https://github.com/renode/renode/releases/download/v${{ env.RENODE_VERSION }}/renode-${{ env.RENODE_VERSION }}.linux-portable.tar.gz' }}

      - name: Verify
        run: ${{ steps.renode.outputs.renode-path }}/renode --version
```

## Development

```bash
# Install dependencies
npm install

# Build the action
npm run build

# Test locally (requires act)
act -j test
```

## License

MIT — see [LICENSE](LICENSE) file.
