(function (){
  if (window.app) {
    return;
  }

  /* Flag to check for arrays */
  window.Array.prototype.isArray = true;

  /* Global classes */
  window.RTTask = function (c, t, d) {
    /*
    C	Tiempo ejecucion
    T	Periodo
    D	Vencimiento
    */
    this.executionTime = typeof c == 'string' ? parseFloat(c) : c;
    this.period = typeof t == 'string' ? parseFloat(t) : t;
    this.expire = typeof d == 'string' ? parseFloat(d) : d;
    this.fu = this.period > 0 ? this.executionTime / this.period : 0;
  };

  window.RTSystem = function (tasks) {
    if (!tasks.isArray){
      throw 'RTSystem: Parameter is not an array'
    }

    this.hyperperiod = null;

    this.tasks = tasks;
    this._responseTimes = [];

    this.getHyperperiod =  () => {
      if (!this.hyperperiod){
        let periods = _.map(this.tasks, function(o){ return o.period; });
        this.hyperperiod = math.lcm.apply(null, periods);
      }
      return this.hyperperiod;
    };

    this.getFU =  () => {
      if (!this.fu) {
        this.fu = math.sum(_.map(this.tasks, function(o){ return o.fu; }));
      }
      return this.fu;
    };

    this.getN =  () => {
      if (!this.n) {
        this.n = !!this.tasks ? this.tasks.length : 0;
      }
      return this.n;
    };

    this.getLiu =  () => {
      if (!this.liu) {
        let n = this.getN();
		    this.liu = math.round(n*(math.pow(2, 1/n) - 1), 2);
      }
      return this.liu;
    };

    this.isValidForLiu =  () => this.getFU() <= this.getLiu();

    this.getBini =  () => {
      if (!this.bini) {
        this.bini = math.round(math.prod(_.map(this.tasks, function(o){ return o.fu + 1; })), 2);
        return this.bini;
      }
      return this.bini;
    };

    this.isValidForBini =  ()  => this.getBini() <= 2;

    this.getTaskTiming = () => {
      if (this._responseTimes.length > 0) return this._responseTimes;

      /* When there are no other tasks, reponse time = execution time */
      this._responseTimes.push(this.tasks[0].executionTime);

      if (this.tasks.length == 1) return this._responseTimes;

      /* For the others calculate */
      /*
      t^(q+1) = Ci + SUM (j=1 -> i-1) Ceil(t^q / Tj).Cj
      */

      for (var i = 1; i < this.tasks.length; i++) {
        let currentTask = this.tasks[i];
        let prevTask = this.tasks[i - 1];

        /* Add seed (Previous response time) to partial result */
        let seed = this._responseTimes[i - 1];
        let partialResults = [seed];
        /* There is no previous result yet */
        let previousResult = null;
        /* Current result is the seed */
        let currentResult = partialResults[0];

        do {
          previousResult = currentResult;
          /* Current result initialized with the execution time of the current task  */
          currentResult = currentTask.executionTime;

          /* Iterate over all previous tasks -> SUM (from j=1 to i-1) Ceil(t^q / Tj).Cj */
          for (let x = 0; x < i; x++) {
            let loopTask = this.tasks[x];
            currentResult += math.ceil(previousResult / loopTask.period) * loopTask.executionTime
          }
          /* If both values are different continue else a fixed point has been found */
        }
        while (previousResult != currentResult);

        this._responseTimes.push(currentResult);
      }

      return this._responseTimes;
    }

    this.getFirstFreeSlot = () => {
      if (this.firstFreeSlot === null) return this._firstFreeSlot;

      /* M >= menor t | t = 1 + j=1 SUM n (techo(t / Tj) * Cj) */

      let latestResponseTime = _.last(this.getTaskTiming());

      let seed = 1 + latestResponseTime;

      let partialResults = [seed];
      /* There is no previous result yet */
      let previousResult = null;
      /* Current result is the seed */
      let currentResult = partialResults[0];

      do {
        previousResult = currentResult;
        /* Current result initialized with 1 */
        currentResult = 1;

        /* Iterate over all previous tasks -> SUM (from j=1 to i-1) Ceil(t^q / Tj).Cj */
        for (let x = 0; x < this.tasks.length; x++) {
          let loopTask = this.tasks[x];
          currentResult += math.ceil(previousResult / loopTask.period) * loopTask.executionTime;
        }
        /* If both values are different continue else a fixed point has been found */
      }
      while (previousResult != currentResult);

      return previousResult;
    }
  };

  window.app =  {
    urls: {
      prolog: "api/prolog"
    },
    init: function (){
      let menuItems = $("#main-menu li.nav-item.partial-view");
      menuItems.on("click", window.app.events.onClick_navItem);
      menuItems.first().trigger("click");
    },
    events: {
      onClick_navItem: e => {
        e.preventDefault();
        $("li.nav-item").removeClass("active");
        let fileRoute = $(e.currentTarget).find("a").attr("href");
        if (fileRoute === "#" || fileRoute === ""){
          fileRoute = "views/missing.html"
        }
        window.app.utils.loadView(fileRoute);
        $(e.currentTarget).addClass("active");
      }
    },
    pl: {
      init: type => {
        return $.post(app.urls.prolog, JSON.stringify({prolog: type, name: "tnt_luna_etchezar.pl"}))
      },
      test: (type, id) => {
        const dest = {
          id: id,
          type: type,
          run: () => {
            return app.pl.runTest(type, id).then(v => {
              dest.ran = v === "yes.";
              return dest;
            });
          }
        };
        return app.pl.fetchTest(type,id).then(v => {
          dest.content = v;
          return app.pl.loadTest(type,id);
        }).then(v => {
          dest.loaded = v === "ok";
          return dest;
        });
      },
      fetchTest: (type, id) => {
        return $.get("statics/pl/tests/" +  type + "_" + id+ ".pl");
      },
      loadTest: (type, id) => {
        return $.post(app.urls.prolog, JSON.stringify({prolog: type, name: "tests/" + type + "_" + id + ".pl"}));
      },
      runTest: (type, id) => {
        return $.get(app.urls.prolog, {prolog: type, clause: "test_" + type + "_" + id + "."});
      },
      display: type => {
        return $.get(app.urls.prolog, {prolog: type, clause: "display_kb(A,B)."}).then(v => {
          debugger;
          const lines = v.split("\n");
          if(lines[0] === "yes.") {
            return lines[lines.length > 1 ? 1 : 0];
          }
          throw "Error running test: " + JSON.stringify({id: id, type: type});
        });
      }
    },
    utils: {
      loadView: (viewFile, containerId) => {
        let domId = containerId ? containerId : "page-content";
        $('#' + domId).load("views/" + viewFile);
      },
      initTestView: type => {
        const $content = $("#" + type + "-content");
        const $tests = $content.find("div.list-group>button");
        return app.pl.init(type).then(() => {
          return $.when.apply($,  $.makeArray($tests).map(e => $(e).data())
          .filter(data => !!data.id)
          .map(data => {
            return app.pl.test(data.type, data.id)
          })).then((...res) => {
            return res;
          })
        });
      },
      initTestList: type => {
        const $list = $("#" + type + "-test-list");
        const $items = $list.find("button");
        $items.on("click", e => {
          e.target.addClass("active");
          $items.forEach($e => $e.data().id !== e.target.data().id && $e.removeClass("active"));
        });
      },
      parseTask: task => {
        let parsedTask = /\((\d+),(\d+),(\d+)\)/.exec(task);
        if (parsedTask.length != 4) throw "Invalid system, can't parse";
        return new RTTask(parsedTask[1], parsedTask[2], parsedTask[3]);
      },
      parseSystem: system => {
        let charStack = [];
        let currentTask = "";
        let tasks = [];
        for (var i = 0; i < system.length; i++) {
          let currentChar = system[i];
          switch (currentChar) {
            case ' ':
              break;
            case '(':
              charStack.push(currentChar);
              currentTask += currentChar;
              break;
            case ')':
              charStack.pop(currentChar);
              currentTask += currentChar;
              break;
            case ',':
              if (charStack.length  > 0){
                currentTask += currentChar;
              }
              else {
                tasks.push(app.utils.parseTask(currentTask));
                currentTask = "";
              }
              break;
            default:
              currentTask += currentChar;
          }
        }


        if (charStack.length > 0) throw "Parsing failed";

        if (currentTask.length > 0) {
          tasks.push(app.utils.parseTask(currentTask));
        }

        return tasks;
      }
    },
    views: {}
  };
})();
//# sourceURL=app.js
