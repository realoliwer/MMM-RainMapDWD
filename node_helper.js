const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
    retryTimer: null,

    log: function(level, message) {
        const levels = { "NONE": 0, "ERROR": 1, "INFO": 2, "DEBUG": 3 };
        const configLevel = this.config && this.config.logLevel ? levels[this.config.logLevel.toUpperCase()] : 2;
        const msgLevel = levels[level] || 2;

        if (msgLevel <= configLevel) {
            const prefix = `[${this.name}] `;
            if (level === "ERROR") {
                console.error(prefix + message);
            } else {
                console.log(prefix + message);
            }
        }
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "CONFIG") {
            this.config = payload;
            this.log("INFO", "Configuration received. Starting weather monitor...");
            
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

        const { lat, lon, showIfRainWithin, alwaysVisible } = this.config;

        if (alwaysVisible) {
            this.sendSocketNotification("SHOW_RADAR", { show: true, precipType: "rain" });
        }

        try {
            this.log("DEBUG", `Starting API request for coordinates: ${lat}, ${lon}`);
            
            const today = new Date().toISOString();
            const url = `https://api.brightsky.dev/weather?lat=${lat}&lon=${lon}&date=${today}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Server responded with status ${response.status}`);
            }

            const data = await response.json();

            if (!data.weather) {
                this.log("ERROR", "Incomplete API response (missing 'weather' array).");
                return;
            }

            const now = new Date();
            const limit = new Date(now.getTime() + showIfRainWithin * 60000);
            
            const upcomingEvent = data.weather.find(h => {
                const fTime = new Date(h.timestamp);
                return fTime >= now && fTime <= limit && h.precipitation > 0;
            });

            let precipType = "rain";
            if (upcomingEvent && upcomingEvent.condition) {
                precipType = upcomingEvent.condition;
            }

            if (!alwaysVisible) {
                if (upcomingEvent) {
                    this.log("INFO", `Precipitation detected (${precipType}). Radar will be shown.`);
                    this.sendSocketNotification("SHOW_RADAR", { show: true, precipType: precipType });
                } else {
                    this.log("DEBUG", "No precipitation expected. Hiding radar.");
                    this.sendSocketNotification("SHOW_RADAR", { show: false });
                }
            } else if (upcomingEvent) {
                // If always visible but weather changed, we update the precipType silently
                this.sendSocketNotification("SHOW_RADAR", { show: true, precipType: precipType });
            }

        } catch (error) {
            this.log("ERROR", `Fetch failed: ${error.message}`);
            this.log("INFO", "Network not ready or API unreachable. Scheduling automatic retry in 30 seconds...");
            
            this.retryTimer = setTimeout(() => {
                this.log("INFO", "Executing scheduled retry after previous failure...");
                this.checkWeather();
            }, 30000); 
        }
    }
});
