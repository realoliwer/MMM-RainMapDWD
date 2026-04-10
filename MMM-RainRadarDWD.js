Module.register("MMM-RainRadarDWD", {
    defaults: {
        lat: 53.5511,
        lon: 9.9937,
        zoomLevel: 9,
        updateInterval: 10 * 60 * 1000,
        showIfRainWithin: 120,
        alwaysVisible: false,
        
        timePast: 60,
        timeFuture: 120,
        frameStep: 10,
        animationSpeed: 2000, 
        
        width: "350px",
        height: "350px",
        border: "none",
        markerSymbol: "fa-home",
        markerColor: "#ff0000",
        cloudBlur: 12,         
        
        showLegend: true,
        legendPosition: "bottom", 
        
        textPast: "PAST",
        textNow: "NOW",
        textForecast: "FORECAST",
        textRainExpected: " - Rain expected:",
        textSnowExpected: " - Snow expected:",
        textSleetExpected: " - Sleet expected:",
        textHailExpected: " - Hail expected:",
        textLoading: "Loading data...",
        textLight: "Light",
        textHeavy: "Heavy",
        
        logLevel: "INFO"
    },

    getScripts: function() { 
        // We load OpenLayers via CDN to keep the module Zero-Dependency for the user to avoid forcing users to run 'npm install'
        return ["https://cdn.jsdelivr.net/npm/ol@v8.2.0/dist/ol.js"]; 
    },
    
    getStyles: function() { 
        return ["MMM-RainRadarDWD.css", "font-awesome.css", "https://cdn.jsdelivr.net/npm/ol@v8.2.0/ol.css"]; 
    },

    log: function(level, message) {
        // Custom logging function to filter output based on the configured logLevel.
        const levels = { "NONE": 0, "ERROR": 1, "INFO": 2, "DEBUG": 3 };
        const configLevel = levels[(this.config.logLevel || "INFO").toUpperCase()] || 2;
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

    start: function() {
        this.log("INFO", "Module version 0.9.2 started.");
        
        this.config = Object.assign({}, this.defaults, this.config);
        
        // Initialize state variables
        this.showRadar = false;
        this.currentPrecipType = "rain";
        this.map = null;
        this.radarLayers = [];
        this.animationTimer = null;
        this.currentStep = 0;
        this.radarUpdateInterval = null;
        
        // Trigger the node_helper to start the weather API polling
        this.sendSocketNotification("CONFIG", this.config);
    },

    getDom: function() {
        // Construct the main wrapper container for the module
        const wrapper = document.createElement("div");
        wrapper.id = "rainradar-wrapper";
        
        wrapper.style.width = this.config.width;
        wrapper.style.height = this.config.height;
        wrapper.style.border = this.config.border;
        
        // Inject the blur radius directly into the CSS environment as a variable
        wrapper.style.setProperty('--cloud-blur', this.config.cloudBlur + 'px');

        // Hide the DOM completely if the API has determined no precipitation is expected
        if (!this.showRadar) {
            wrapper.style.display = "none";
            return wrapper;
        }

        // Dynamically build the legend based on configuration positioning
        let legendHTML = "";
        if (this.config.showLegend) {
            const pos = this.config.legendPosition;
            const legendClass = (pos === "top" || pos === "bottom") ? "legend-horizontal" : "legend-vertical";
            const posClass = `legend-pos-${pos}`;
            
            legendHTML = `
                <div id="rainradar-custom-legend" class="${legendClass} ${posClass}">
                    <div class="legend-bar"></div>
                    <div class="legend-labels">
                        <span>${this.config.textLight}</span>
                        <span>${this.config.textHeavy}</span>
                    </div>
                </div>
            `;
        }

        // Assemble the final HTML structure
        wrapper.innerHTML = `
            <div id="rainradar-map" style="width:100%; height:100%; background-color: #111;"></div>
            <div id="rainradar-time">${this.config.textLoading}</div>
            ${legendHTML}
            <div class="rainradar-marker" style="color:${this.config.markerColor}">
                <i class="fas ${this.config.markerSymbol}"></i>
            </div>
        `;
        
        return wrapper;
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "SHOW_RADAR") {
            if (payload.show) {
                const wasHidden = !this.showRadar;
                this.showRadar = true;
                this.currentPrecipType = payload.precipType || "rain";
                
                if (wasHidden) {
                    // Update DOM immediately to inject the map container, then wait for the browser to render it before initializing OpenLayers, otherwise the map canvas breaks.
                    this.updateDom(0);
                    let retries = 0;
                    let checkExist = setInterval(() => {
                        if (document.getElementById("rainradar-map")) {
                            clearInterval(checkExist);
                            this.updateRadarData();
                            this.startRadarUpdateInterval();
                        }
                        if (++retries > 50) {
                            clearInterval(checkExist);
                        }
                    }, 100);
                } else {
                    // Module is already visible, just update the data
                    this.updateRadarData(); 
                    this.startRadarUpdateInterval();
                }
            } else {
                // Hide the radar and halt all active intervals to save CPU/Memory
                this.showRadar = false;
                this.updateDom(500);
                if (this.animationTimer) clearInterval(this.animationTimer);
                this.stopRadarUpdateInterval();
            }
        }
    },

    startRadarUpdateInterval: function() {
        // Runs a background check every 2 minutes while the radar is visible. This decouples the radar rendering from the API polling, ensuring the "NOW" timestamp stays synchronized with reality.
        if (!this.radarUpdateInterval) {
            this.log("DEBUG", "Starting dynamic 2-minute background ping to check for new DWD images.");
            this.radarUpdateInterval = setInterval(() => {
                this.updateRadarData();
            }, 2 * 60 * 1000); 
        }
    },

    stopRadarUpdateInterval: function() {
        if (this.radarUpdateInterval) {
            this.log("DEBUG", "Stopping radar frame background update (module hidden).");
            clearInterval(this.radarUpdateInterval);
            this.radarUpdateInterval = null;
        }
    },

    updateRadarData: async function() {
        if (typeof ol === "undefined") return;

        // Calculate the current 5-minute interval (e.g., 08:04 becomes 08:00)
        let candidateTime = new Date();
        candidateTime.setMilliseconds(0);
        candidateTime.setSeconds(0);
        candidateTime.setMinutes(Math.floor(candidateTime.getMinutes() / 5) * 5);
        const timeStr = candidateTime.toISOString().split('.')[0] + "Z";    
        
        // PRE-FLIGHT PING: We request an ultra-tiny 2x2 pixel bounding box from the DWD server. As it takes a few minutes to process the latest radar data on DWD end-
        // If we request the full map too early, we get a 404 error. This ping checks if the image is actually ready using virtually zero bandwidth (~100 bytes).
        const testUrl = `https://maps.dwd.de/geoserver/dwd/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=dwd:Niederschlagsradar&TIME=${timeStr}&WIDTH=2&HEIGHT=2&CRS=EPSG:3857&BBOX=1113194,6621293,1113200,6621300`;

        let baseTime = candidateTime;
        try {
            const res = await fetch(testUrl);
            const contentType = res.headers.get("content-type");
            
            // If the DWD server returns XML instead of an image, it means the frame is not computed yet. In that case, we fall back to the safe image from 5 minutes ago.
            if (!res.ok || (contentType && contentType.includes("xml"))) {
                this.log("DEBUG", `DWD image for ${timeStr} not ready yet. Using -5 min fallback.`);
                baseTime = new Date(candidateTime.getTime() - 5 * 60000);
            } else {
                this.log("DEBUG", `DWD image for ${timeStr} is online! Setting to NOW.`);
            }
        } catch (e) {
            this.log("DEBUG", `Ping failed, falling back -5 mins.`);
            baseTime = new Date(candidateTime.getTime() - 5 * 60000);
        }

        // Prevent unnecessary OpenLayers processing if the DWD base time hasn't advanced yet.
        if (this.lastBaseTime && this.lastBaseTime.getTime() === baseTime.getTime() && this.map) {
            this.log("DEBUG", "Base time hasn't changed. Skipping OpenLayers update to save CPU.");
            return;
        }

        this.lastBaseTime = baseTime;

        // Initialize the OpenLayers map instance if it doesn't exist
        if (!this.map) {
            this.map = new ol.Map({
                target: 'rainradar-map',
                layers: [
                    new ol.layer.Tile({
                        source: new ol.source.XYZ({
                            url: 'https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
                        })
                    })
                ],
                view: new ol.View({
                    center: ol.proj.fromLonLat([this.config.lon, this.config.lat]),
                    zoom: this.config.zoomLevel
                }),
                controls: [] // Hide default map controls (zoom buttons, etc.)
            });
        }

        // Generate the timeline frames based on config
        const startMins = -Math.min(this.config.timePast, 120);
        const endMins = Math.min(this.config.timeFuture, 120);
        const step = Math.max(this.config.frameStep, 5);
        
        let frameIndex = 0;

        for (let mins = startMins; mins <= endMins; mins += step) {
            const frameTime = new Date(baseTime.getTime() + mins * 60000);
            const frameTimeStr = frameTime.toISOString().split('.')[0] + "Z";

            // If a layer for this frame doesn't exist, create it
            if (!this.radarLayers[frameIndex]) {
                const wmsSource = new ol.source.ImageWMS({
                    url: 'https://maps.dwd.de/geoserver/dwd/wms',
                    params: { 'LAYERS': 'dwd:Niederschlagsradar', 'TIME': frameTimeStr },
                    ratio: 1,
                    serverType: 'geoserver',
                    crossOrigin: 'anonymous'
                });
                
                const layer = new ol.layer.Image({
                    className: 'radar-cloud-layer',
                    opacity: frameIndex === 0 ? 0.7 : 0, // Only the first frame starts visible
                    visible: true,
                    source: wmsSource
                });
                
                this.radarLayers.push({ layer: layer, time: frameTime, mins: mins });
                this.map.addLayer(layer);
            } else {
                // If the layer exists, simply update its timestamp parameter to fetch the new image
                this.radarLayers[frameIndex].time = frameTime;
                this.radarLayers[frameIndex].mins = mins;
                this.radarLayers[frameIndex].layer.setOpacity(frameIndex === 0 ? 0.7 : 0);
                this.radarLayers[frameIndex].layer.getSource().updateParams({ 'TIME': frameTimeStr });
            }
            frameIndex++;
        }

        // Clean up any remaining older layers if the timeline was shortened by the user
        while (this.radarLayers.length > frameIndex) {
            const oldLayer = this.radarLayers.pop();
            this.map.removeLayer(oldLayer.layer);
        }
        
        this.startAnimation();
    },

    startAnimation: function() {
        if (this.animationTimer) clearInterval(this.animationTimer); 
        
        this.animationTimer = setInterval(() => {
            if (this.radarLayers.length === 0) return;
            
            // Fade out the currently visible frame
            this.radarLayers[this.currentStep].layer.setOpacity(0);
            
            // Advance to the next frame in the array
            this.currentStep = (this.currentStep + 1) % this.radarLayers.length;
            
            // Fade in the new frame
            const currentItem = this.radarLayers[this.currentStep];
            currentItem.layer.setOpacity(0.7);

            // Determine the specific precipitation text based on backend analysis
            let expectedText = this.config.textRainExpected;
            if (this.currentPrecipType === "snow") expectedText = this.config.textSnowExpected;
            else if (this.currentPrecipType === "sleet") expectedText = this.config.textSleetExpected;
            else if (this.currentPrecipType === "hail") expectedText = this.config.textHailExpected;

            // Format the UI tag based on where the frame sits on the timeline
            let tag = this.config.textNow;
            let tagColor = "#ffff00"; 
            
            if (currentItem.mins < 0) {
                tag = this.config.textPast;
                tagColor = "#aaaaaa";
            } else if (currentItem.mins === 0) {
                tag = this.config.textNow + expectedText;
                tagColor = "#ffff00";
            } else if (currentItem.mins > 0) {
                tag = this.config.textForecast + expectedText;
                tagColor = "#00ff00";
            }

            const minDisplay = currentItem.mins > 0 ? `+${currentItem.mins}` : currentItem.mins;
            
            // Update the UI timestamp overlay
            const timeEl = document.getElementById("rainradar-time");
            if (timeEl) {
                timeEl.innerHTML = `<span style="color:${tagColor}; font-weight:bold; margin-right:5px;">${tag}</span> ${minDisplay} Min (${currentItem.time.getHours()}:${String(currentItem.time.getMinutes()).padStart(2, '0')})`;
            }
        }, this.config.animationSpeed);
    }
});
