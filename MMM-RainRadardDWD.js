Module.register("MMM-RainRadarDWD", {
    defaults: {
        lat: 53.5511,
        lon: 9.9937,
        zoomLevel: 9,
        updateInterval: 10 * 60 * 1000,
        showIfRainWithin: 120,
        alwaysVisible: false,
        
        // --- Time Configuration (minutes) ---
        timePast: 60,
        timeFuture: 120,
        frameStep: 10,
        animationSpeed: 2000, // 2 seconds per frame recommended for smooth transitions
        
        // --- Appearance ---
        width: "350px",
        height: "350px",
        border: "none",
        markerSymbol: "fa-home",
        markerColor: "#ff0000",
        cloudBlur: 12,         // Softens radar pixels
        
        // --- Legend ---
        showLegend: true,
        legendPosition: "bottom", // "top", "bottom", "left", "right"
        
        // --- Language & Text ---
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
        return ["https://cdn.jsdelivr.net/npm/ol@v8.2.0/dist/ol.js"]; 
    },
    
    getStyles: function() { 
        return ["MMM-RainRadarDWD.css", "font-awesome.css", "https://cdn.jsdelivr.net/npm/ol@v8.2.0/ol.css"]; 
    },

    log: function(level, message) {
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
        this.log("INFO", "Module version 0.9.0-beta started.");
        
        this.config = Object.assign({}, this.defaults, this.config);
        
        this.showRadar = false;
        this.currentPrecipType = "rain";
        this.map = null;
        this.radarLayers = [];
        this.animationTimer = null;
        this.currentStep = 0;
        
        this.sendSocketNotification("CONFIG", this.config);
    },

    getDom: function() {
        const wrapper = document.createElement("div");
        wrapper.id = "rainradar-wrapper";
        
        wrapper.style.width = this.config.width;
        wrapper.style.height = this.config.height;
        wrapper.style.border = this.config.border;
        
        // Pass cloud blur to CSS variable
        wrapper.style.setProperty('--cloud-blur', this.config.cloudBlur + 'px');

        if (!this.showRadar) {
            wrapper.style.display = "none";
            return wrapper;
        }

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
                    this.updateDom(0);
                    let retries = 0;
                    let checkExist = setInterval(() => {
                        if (document.getElementById("rainradar-map")) {
                            clearInterval(checkExist);
                            this.updateRadarData();
                        }
                        if (++retries > 50) {
                            clearInterval(checkExist);
                        }
                    }, 100);
                } else {
                    this.updateRadarData(); 
                }
            } else {
                this.showRadar = false;
                this.updateDom(500);
                if (this.animationTimer) {
                    clearInterval(this.animationTimer);
                }
            }
        }
    },

    updateRadarData: function() {
        if (typeof ol === "undefined") return;

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
                controls: []
            });
        }

        // Apply 10-minute safety buffer for DWD computation time
        let baseTime = new Date(Date.now() - 10 * 60000);
        baseTime.setMilliseconds(0);
        baseTime.setSeconds(0);
        baseTime.setMinutes(Math.floor(baseTime.getMinutes() / 5) * 5);

        const startMins = -Math.min(this.config.timePast, 120);
        const endMins = Math.min(this.config.timeFuture, 120);
        const step = Math.max(this.config.frameStep, 5);
        
        let frameIndex = 0;

        for (let mins = startMins; mins <= endMins; mins += step) {
            const frameTime = new Date(baseTime.getTime() + mins * 60000);
            const timeStr = frameTime.toISOString().split('.')[0] + "Z";

            if (!this.radarLayers[frameIndex]) {
                const wmsSource = new ol.source.ImageWMS({
                    url: 'https://maps.dwd.de/geoserver/dwd/wms',
                    params: { 'LAYERS': 'dwd:Niederschlagsradar', 'TIME': timeStr },
                    ratio: 1,
                    serverType: 'geoserver',
                    crossOrigin: 'anonymous'
                });
                
                wmsSource.on('imageloaderror', () => {
                    this.log("DEBUG", `Frame for ${timeStr} missing at DWD. Skipping silently.`);
                });
                
                const layer = new ol.layer.Image({
                    className: 'radar-cloud-layer',
                    opacity: frameIndex === 0 ? 0.7 : 0,
                    visible: true,
                    source: wmsSource
                });
                
                this.radarLayers.push({ layer: layer, time: frameTime, mins: mins });
                this.map.addLayer(layer);
            } else {
                this.radarLayers[frameIndex].time = frameTime;
                this.radarLayers[frameIndex].mins = mins;
                this.radarLayers[frameIndex].layer.setOpacity(frameIndex === 0 ? 0.7 : 0);
                this.radarLayers[frameIndex].layer.getSource().updateParams({ 'TIME': timeStr });
            }
            frameIndex++;
        }

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
            
            // Fade out old frame
            this.radarLayers[this.currentStep].layer.setOpacity(0);
            
            this.currentStep = (this.currentStep + 1) % this.radarLayers.length;
            
            // Fade in new frame
            const currentItem = this.radarLayers[this.currentStep];
            currentItem.layer.setOpacity(0.7);

            let expectedText = this.config.textRainExpected;
            if (this.currentPrecipType === "snow") expectedText = this.config.textSnowExpected;
            else if (this.currentPrecipType === "sleet") expectedText = this.config.textSleetExpected;
            else if (this.currentPrecipType === "hail") expectedText = this.config.textHailExpected;

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
            
            const timeEl = document.getElementById("rainradar-time");
            if (timeEl) {
                timeEl.innerHTML = `<span style="color:${tagColor}; font-weight:bold; margin-right:5px;">${tag}</span> ${minDisplay} Min (${currentItem.time.getHours()}:${String(currentItem.time.getMinutes()).padStart(2, '0')})`;
            }
        }, this.config.animationSpeed);
    }
});
