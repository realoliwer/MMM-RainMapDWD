# Changelog - MMM-RainRadarDWD

All notable changes to this project will be documented in this file.

## [0.9.2] - 2026-04-02
### Added
- Added `rainSearchRadius` to `config.js`. The module can now perform a cross-scan (Center, North, South, East, West) to detect precipitation passing slightly off-center.

### Changed
- Enhanced PM2 debug logging to explicitly state where in the radius the precipitation was detected (e.g., `[West]`).
- Completed README.md configuration options in table

### Fixed
- Fixed a timing bug where the currently running hour was ignored by the API evaluation (added a 60-minute backward buffer).
- Fixed duplicate `[MMM-RainRadarDWD]` prefix in the terminal logs by cleaning up the custom log function.


## [0.9.1] - 2026-04-02
### Added
- Added `.gitignore` to keep the repository clean
- Added modern ESLint flat configuration (`eslint.config.mjs`)
- Added `CODE_OF_CONDUCT.md`
- Added GitHub Dependabot configuration (`.github/dependabot.yml`)
- Added an "Update" instructions section to the `README.md`.

### Changed
- Updated `README.md` links to point to the new `MagicMirrorOrg` organization (formerly `MichMich`).
- Fixed a missing trailing comma in the `config.js` example within the `README.md`.

### Fixed
- Fixed an invalid JSON syntax error (trailing comma) in the `keywords` array of `package.json`.

## [0.9.0] - 2026-03-31
### Added
- Initial Beta Release.
