# Changelog - MMM-RainRadarDWD

All notable changes to this project will be documented in this file.

## [0.9.4] - 2026-04-13
### Fixed
- Electron did not render the map anymore after update of Electron


## [0.9.3] - 2026-04-10
### Added
- Added a dynamic "ping" to the DWD server. The module now requests a microscopic 2x2 pixel image every 2 minutes to check if the latest radar frame is online, ensuring the "NOW" frame is always as current as possible without triggering 404 errors.
- Added an independent background refresh loop to the frontend. The radar timeline and timestamps now update continuously while the module is visible, completely decoupled from the Bright Sky API polling interval.
- Added defineconfig to eslint.config.mjs
- Added eslint script to package.json

### Changed
- added code comments to make it easier to understand why we did certain things in a year or two ;)
- Optimized map rendering by skipping unnecessary OpenLayers updates if the latest available DWD base time hasn't changed.
- updated Eslint to 10.2.0

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
