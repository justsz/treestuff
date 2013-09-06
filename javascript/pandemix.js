pandemix = (function() {
    "use strict";

    var pandemix = {};

    pandemix.counter = 0; //panel count and doubles as panel ID
    pandemix.focusedPanel = 0; //ID of focused panel
    pandemix.scale = 1; //zoom level
    pandemix.panels = []; //array of all added panels
    pandemix.selectedLeaves = [];
    pandemix.selectedNodes = [];
    pandemix.globalData = {}; //keeps track of data added to crossfilter
    pandemix.map = {}; //store map related things, like layers
    

    /*
    Adds a function that correctly counts the 
    number of nodes in a selection.
    */
    d3.selection.prototype.size = function() {
        var n = 0;
        this.each(function() {n += 1; });
        return n;
    };


    pandemix.addGlobalZoomButton = function(targ) {
        var zoomButton = d3.select(targ)
                           .attr("class", "zoomControl");

            zoomButton.append("div")
                       .attr("class", "zoom increase")
                       .on("click", function() {incrementZoom(1); });
                   
            zoomButton.append("div")
                       .attr("class", "zoom decrease")
                       .on("click", function() {incrementZoom(-1); });
    };

    pandemix.addPlayPauseButton = function(targ) {
        var playing = false,
            processID,
            updateInterval = 100, //update frequency in milliseconds
            intervalLength = 10, //update jump in days
            button = d3.select(targ)
                           .attr("class", "playPauseButton")
                           .on("click", function() {
                                if (playing) {
                                    playing = false;
                                    clearInterval(processID);
                                } else {
                                    playing = true;
                                    processID = setInterval(function() {
                                        if (pandemix.selectedDate) {
                                            pandemix.selectedDate.setDate(pandemix.selectedDate.getDate() + intervalLength);
                                            if (pandemix.selectedDate > pandemix.maxDate) {
                                                pandemix.selectedDate = new Date(pandemix.maxDate.getTime());
                                                clearInterval(processID);
                                                playing = false;
                                                button.classed("playing", playing);
                                            }
                                        } else {
                                            pandemix.selectedDate = pandemix.minDate;
                                        }
                                        pandemix.callUpdate("timeSlideUpdate");
                                   }, updateInterval);
                                }

                                button.classed("playing", playing);
                           });
    };


    pandemix.addSearchBox = function(targ) {
        d3.select(targ)
          .attr("class", "searchBox")
          .append("input")
          .attr("type", "text")
          .attr("id", "searchInput")
          .attr("value", "search")
          .on("keyup", search);       
    };


    pandemix.addColorPicker = function(targ) {
        d3.select(targ)
          .attr("class", "colorBox")
          .append("input")
          .attr("type", "text")
          .attr("id", "colorInput")
          .attr("value", "color")
          .on("keyup", applyColor);
    };


    function search(searchTerm) {
        var searchTerm = searchTerm || d3.select("input#searchInput").node().value//document.getElementById("search").value;
        var searchRegex = new RegExp(searchTerm);
        var selectedNodes = [];
    
        if (searchTerm) { //do no selection if search field is empty
            d3.selectAll("svg.treePanel")
              .selectAll(".leaf")
              .each(function(d) {
                  if (searchRegex.test(d.name)) {
                      selectedNodes.push(d);
                  }
              });
        }
    
        pandemix.selectedLeaves = selectedNodes;
        pandemix.callUpdate("leafSelectionUpdate");
    };

    function applyColor() {
        var color = d3.select("input#colorInput").node().value;
        if (color === "") {
            color = null;
        }
        pandemix.callUpdate("leafColorUpdate", color);
    };


    function incrementZoom(dir) {
        var newScale = pandemix.scale + 0.5 * dir;
        if (newScale < 1) {
            newScale = 1;
        }
        pandemix.scale = newScale;
        pandemix.callUpdate("zoomUpdate"); 
    }; 


    /*
    Create the crossfilter. Data can be added to it as it becomes available
    when trees are being loaded.
    */
    pandemix.initializeCrossfilter = function() {        
        pandemix.nodes = crossfilter();
        pandemix.nodeDateDim = pandemix.nodes.dimension(function(d) {return d.date; });

        pandemix.links = crossfilter();
        pandemix.linkStartDateDim = pandemix.links.dimension(function(d) {return d.startDate; });
        pandemix.linkEndDateDim = pandemix.links.dimension(function(d) {return d.endDate; });
        pandemix.treeIdDim = pandemix.links.dimension(function(d) {return d.treeID; });

        pandemix.taxa = crossfilter();
        pandemix.nameDim = pandemix.taxa.dimension(function(d) {return d.name; });
        pandemix.locDim = pandemix.taxa.dimension(function(d) {return d.location; });
        pandemix.dateDim = pandemix.taxa.dimension(function(d) {return d.date; });
        
    };


    pandemix.getNodeKey = function(d, i) {
        return (d.name || i);
    };


    pandemix.getLinkKey = function(d, i) {
        return (d.target.name || i);
    };


    pandemix.contains = function(a, obj) {
        var i;
        for (i = 0; i < a.length; i += 1) {
            if (a[i] === obj) {
                return true;
            }
        }
        return false;
    };


    pandemix.accContains = function(a, obj, aAcc, objAcc) {
        var i;
        for (i = 0; i < a.length; i += 1) {
            if (aAcc(a[i]) === objAcc(obj)) {
                return true;
            }
        }
        return false;
    };


    pandemix.indexOf = function(a, obj, aAcc, objAcc) {
        var i;
        for (i = 0; i < a.length; i += 1) {
            if (aAcc(a[i]) === objAcc(obj)) {
                return i;
            }
        }
        return -1;
    };


    pandemix.containsLeaf = function(a, obj) {
        if (a.length === 0) {
            return false;
        }
    
        var i;
        for (i = 0; i < a.length; i += 1) {
            if (a[i].name === obj.name) {
                return true;
            }
        }
        return false;
    };

    /*
    Iterates through all registered panels and attempts
    to call the specified update type.
    */
    pandemix.callUpdate = function(updateType) {
        var i;
        for (i = 0; i < pandemix.panels.length; i += 1) {
            if (pandemix.panels[i].hasOwnProperty(updateType)) {
                pandemix.panels[i][updateType](arguments); //pass arguments given to this function to the update function
            }
        }
    };


    pandemix.panelsLoaded = function(panelType) {
        var out = true,
            i;
        for (i = 0; i < pandemix.panels.length; i += 1) {
            if (pandemix.panels[i].panelType === panelType && pandemix.panels[i].hasOwnProperty("finishedLoading")) {
                out = out && pandemix.panels[i].finishedLoading();
            }
        }
    return out;
    };

    /*
    Waits until function "test" returns true.
    When that happens, runs the "callback" function.
    Checks "test" every "interval" milliseconds.
    */
    pandemix.when = function(test, callback, interval) {
        var interval = interval || 100;
        window.setTimeout(function loopFunc() {
            if (test()) {
                callback();
            } else {
                window.setTimeout(loopFunc, interval);
            }
        }, interval);
    };

    /*
    Function for calculating an HSB color given how many colors in total should be represented.
    */
    pandemix.getHSBColor = function(colorIndex, totalColors, offset, saturation, brightness) {
        // if (colorIndex > totalColors - 1) {
        //     throw new Error("Color index larger than (total colors - 1) when calling for HSB Color.");
        // }
        if (!(colorIndex && totalColors) && colorIndex !== 0) {
            throw new Error("Called for HSB color without specifying color index or total colors.");
        }
        var off = offset || 0;
        var sat = saturation || 75;
        var br = brightness || 50;
        var ci = colorIndex % totalColors;
        var hue = (off + ci * 360 / totalColors) % 360;
        return "hsl(" + hue + "," + sat + "%," + br + "%)";
    }




    return pandemix
}());













