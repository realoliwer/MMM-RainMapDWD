const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
    retryTimer: null,

    log: function(level, message) {
        // We handle custom logging here to respect the user's config level.
        const levels = { "NONE": 0, "ERROR": 1, "INFO": 2, "DEBUG": 3 };
        const configLevel = this.config && this.config.logLevel ? levels[this.config.logLevel.toUpperCase()] : 2;
        const msgLevel = levels[level] || 2;

        if (msgLevel <= configLevel) {
            if (level === "ERROR") {
                console.error(message);
            } else {
                console.log(message);
            }
        }
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "CONFIG") {
            this.config = payload;
            this.log("INFO", "Configuration received. Starting weather monitor...");
            
            // Fire the first check immediately, then start the polling loop
            this.checkWeather();
            
            setInterval(() => {
                this.log("DEBUG", "Regular update interval reached.");
                this.checkWeather();
            }, this.config.updateInterval);
        }
    },

    async checkWeather() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        const { lat, lon, showIfRainWithin, alwaysVisible, rainSearchRadius = 0 } = this.config;

        try {
            this.log("DEBUG", `--- WEATHER CHECK STARTED ---`);
            
            // 1. Establish the base location (Center)
            const locations = [{ lat: lat, lon: lon, name: "Center" }];
            
            // Radar clouds often pass slightly offset from the exact GPS coordinate. By calculating 4 additional points (North, South, East, West), we simulate a wider catchment area to trigger the module even if a storm cell barely misses the precise center location. Keep in mind that the roster of DWD cells is roughly 2x2 kilometers
            if (rainSearchRadius > 0) {
                // Approximate degree conversion for latitude/longitude offsets based on the radius
                const latOffset = rainSearchRadius / 111.32;
                const lonOffset = rainSearchRadius / (111.32 * Math.cos(lat * Math.PI / 180));

                locations.push({ lat: lat + latOffset, lon: lon, name: "North" });
                locations.push({ lat: lat - latOffset, lon: lon, name: "South" });
                locations.push({ lat: lat, lon: lon + lonOffset, name: "East" });
                locations.push({ lat: lat, lon: lon - lonOffset, name: "West" });
                
                this.log("DEBUG", `Search Radius active: ${rainSearchRadius}km. Scanning 5 points around base location.`);
            } else {
                this.log("DEBUG", `Scanning exact location only.`);
            }

            const today = new Date().toISOString();

            // 2. Fetch data from Bright Sky API for all calculated locations concurrently.
            // Promise.all ensures we don't proceed until every location has reported its weather model.
            const fetchPromises = locations.map(loc => {
                const url = `https://api.brightsky.dev/weather?lat=${loc.lat}&lon=${loc.lon}&date=${today}`;
                
                this.log("DEBUG", `[${loc.name}] Requesting Lat: ${loc.lat}, Lon: ${loc.lon}`);
                this.log("DEBUG", `[${loc.name}] URL: ${url}`);

                return fetch(url).then(async res => {
                    if (!res.ok) throw new Error(`Status ${res.status}`);
                    const data = await res.json();
                    return { name: loc.name, weather: data.weather };
                });
            });

            const responses = await Promise.all(fetchPromises);

            const now = new Date();
            
            // BUGFIX (-60 minutes): The API delivers hourly forecasts (e.g., exactly at 15:00:00).
            // If the current time is 15:15, a simple 'future check' would completely ignore the
            // precipitation occurring in the currently active hour. Subtracting 60 minutes ensures
            // the ongoing hour is always evaluated.
            const checkStart = new Date(now.getTime() - 60 * 60000);
            const limit = new Date(now.getTime() + showIfRainWithin * 60000);
            
            this.log("DEBUG", `Looking for rain between ${checkStart.toLocaleTimeString()} and ${limit.toLocaleTimeString()}`);

            let upcomingEvent = null;

            // 3. Evaluate the fetched data
            for (const response of responses) {
                if (!response.weather) continue;

                const relevantHours = response.weather.filter(h => {
                    const fTime = new Date(h.timestamp);
                    return fTime >= checkStart && fTime <= limit;
                });

                // Find the very first hour where precipitation > 0 is expected for this location
                const eventAtLocation = relevantHours.find(h => h.precipitation > 0);

                if (eventAtLocation) {
                    this.log("DEBUG", `[${response.name}] Hit! Precipitation: ${eventAtLocation.precipitation} mm | Condition: ${eventAtLocation.condition}`);
                    
                    // Store the first detected event globally and append its location identifier for logging
                    if (!upcomingEvent) {
                        upcomingEvent = { 
                            ...eventAtLocation, 
                            locationName: response.name 
                        };
                    }
                } else {
                    this.log("DEBUG", `[${response.name}] All clear.`);
                }
            }

            // 4. Send visibility and precipitation data to the frontend module
            if (!alwaysVisible) {
                if (upcomingEvent) {
                    this.log("INFO", `Precipitation detected nearby at [${upcomingEvent.locationName}] (${upcomingEvent.precipitation} mm). Radar will be shown.`);
                    this.sendSocketNotification("SHOW_RADAR", { show: true, precipType: upcomingEvent.condition || "rain" });
                } else {
                    this.log("INFO", `No precipitation expected in the given timeframe or radius. Hiding radar.`);
                    this.sendSocketNotification("SHOW_RADAR", { show: false });
                }
            } else {
                // If the user forces visibility, we still attempt to send the correct condition type
                if (upcomingEvent) {
                    this.sendSocketNotification("SHOW_RADAR", { show: true, precipType: upcomingEvent.condition || "rain" });
                } else {
                    this.sendSocketNotification("SHOW_RADAR", { show: true, precipType: "rain" });
                }
            }

        } catch (error) {
            this.log("ERROR", `Fetch failed: ${error.message}`);
            this.log("INFO", "Network not ready or API unreachable. Scheduling automatic retry in 30 seconds...");
            
            // Automatic retry mechanism to prevent the module from failing silently on network drops
            this.retryTimer = setTimeout(() => {
                this.log("INFO", "Executing scheduled retry after previous failure...");
                this.checkWeather();
            }, 30000); 
        }
    }
});
