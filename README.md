# MMM-RainRadarDWD
This module has been developed mostly by vibe coding with an AI as I am not a real developer. If you want to take over the module and maintaine the code, please feel free to contact me. I just wanted to get a solution for myself and happy to share the result for now =)

A smart, zero-dependency Rain & Snow Radar module for [MagicMirror²](https://github.com/MichMich/MagicMirror) using data from GERMAN weather service (DWD). Hence it is only working for areas in Germany!

It displays animated radar data (past and forecast) from the official **Deutscher Wetterdienst (DWD)** on an OpenLayers map. 

To keep your mirror clean, the module acts smartly: It stays completely hidden during sunny weather and only pops up if rain, snow, sleet, or hail is expected at your location within your configured timeframe.

## Features
* **Smart Visibility:** Only shows up when precipitation is coming.
* **Precipitation Detection:** Automatically detects and displays whether to expect rain, snow, sleet, or hail.
* **Official Data:** Uses DWD WMS `dwd:Niederschlagsradar` for up to 2 hours of past measurements and 2 hours of future forecasting (Nowcast).

  
![Demo](rainradar.gif)

## Installation

1. Navigate into your MagicMirror `modules` folder:
   ```bash
   cd ~/MagicMirror/modules
2. Clone this repository:
   ```bash
   git clone https://github.com/realoliwer/MMM-RainRadarDWD.git
3. Restart your MagicMirror;e.g. with
   ```bash
   pm2 restart MagicMirror.
  No additional npm install is required! 

## Configuration

Add the module to your config/config.js file. All parameters are optional and will fall back to defaults if omitted. There are quite a number of configuration options available, but you only need to configure lat and lon for your location to make the module work!

        {
    module: "MMM-RainRadarDWD",
    position: "top_right",
    config: {
        lat: 53.5511,                  // Latitude (e.g., Hamburg)
        lon: 9.9937,                   // Longitude
        
        // --- Visibility & Logic ---
        alwaysVisible: false,          // TRUE: map is always there. FALSE: pops up only if rain/snow is coming.
        showIfRainWithin: 120,         // Timeframe (minutes) to check for upcoming precipitation.
        
        // --- Time Frames (DWD Limits: max 120 past, max 120 future) ---
        timePast: 60,                  // How many minutes into the past to animate?
        timeFuture: 120,               // How many minutes into the future to animate?
        frameStep: 10,                 // Minutes per frame jump (Recommended: 5 or 10)
        
        // --- Appearance ---
        width: "350px",                // Module width
        height: "350px",               // Module height
        border: "none",                // e.g., "2px solid #ffffff"
        zoomLevel: 9,                  // Map Zoom (9-10 recommended for region view)
        cloudBlur: 12,                  // Softens radar pixels (0 = sharp grid, 2-5 = realistic clouds)
        markerSymbol: "fa-home",       // FontAwesome icon for your location
        markerColor: "#ff0000",        // Color of the center marker
        
        // --- Custom Legend ---
        showLegend: true,              // Show the custom CSS color scale
        legendPosition: "bottom",      // Options: "top", "bottom", "left", "right"
        
        // --- Language & Text ---
        textPast: "PAST",
        textNow: "NOW",
        textForecast: "FORECAST",
        textRainExpected: " - Rain expected:",
        textSnowExpected: " - Snow expected:",
        textSleetExpected: " - Sleet expected:",
        textHailExpected: " - Hail expected:",
        textLoading: "Loading data...",
        textLight: "Light",            // Legend text for light rain
        textHeavy: "Heavy",            // Legend text for heavy rain/hail
        
        // --- System ---
        animationSpeed: 2000,          // Duration of one frame in ms (2000ms recommended for smooth fade)
        updateInterval: 600000,        // Check weather API every 10 minutes
        logLevel: "INFO"               // "NONE", "ERROR", "INFO", "DEBUG"
    }
    }

## Configuration Options Explained
| Option | Type | Default | Description |
|---------|-----|--------- |-------------|
| lat | Number | 53.5511 | Latitude of your location. |
| lon |	Number | 9.9937 |	Longitude of your location. |
| alwaysVisible |	Boolean |	false |	If true, the map is always shown. If false, it acts smartly and only shows up when precipitation is detected.
| showIfRainWithin | Number |	120 |	If alwaysVisible is false, the module will check if precipitation is expected within this amount of minutes.
| timePast |	Number	| 60	| How many minutes into the past the radar should show. Max: 120.
| timeFuture |	Number	| 120	| How many minutes into the future the forecast should show. Max: 120.
| frameStep	| Number	| 10	| The minute increments between frames. Default is 10. Minimum is 5.
| cloudBlur	| Number	| 12	CSS | blur applied to the radar layer. 0 shows the raw 1x1 km DWD grid. 2 to 4 creates realistic, soft clouds.
| animationSpeed	| Number | 2000 |	Milliseconds per frame. 2000 is highly recommended to allow the CSS cross-fade animation to look smooth.
| zoomLevel	| Number	9 |	Initial map zoom. | See Zoom Level Guide below.
| logLevel	| String	| "INFO" | Terminal output verbosity. Choose "NONE", "ERROR", "INFO", or "DEBUG

## Zoom Levels Reference

OpenLayers uses a logarithmic scale for zoom levels. Depending on your preference, set zoomLevel to:
    4 - 6: Country level (e.g., all of Germany).
    7 - 8: State level (Good to see incoming fronts from afar).
    9 - 10: Regional level (Best balance between overview and detail. Recommended).
    11 - 13: City/District level (You can see parts of your city).
    14+: Street level (Not recommended, as radar pixels will become too large).

## Credits & Attribution

This module relies on several amazing open data sources and open-source projects. By using this module, you agree to their respective terms of use.

Weather & Radar Data: Deutscher Wetterdienst (DWD). Data provided under the Datenlizenz Deutschland - Namensnennung - Version 2.0.
API Endpoint: Weather condition checks are powered by the open-source Bright Sky API.
Base Map: Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.
Map Engine: Powered by OpenLayers.

## License
MIT License
