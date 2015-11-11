$(function() { 
  var restPath =  '../scripts/metrics.js/';
  var dataURL = restPath + 'trend/json';
  var backgroundColor = '#ffffff';
  var SEP = '_SEP_';
  var colors = [
    '#3366cc','#dc3912','#ff9900','#109618','#990099','#0099c6','#dd4477',
    '#66aa00','#b82e2e','#316395','#994499','#22aa99','#aaaa11','#6633cc',
    '#e67300','#8b0707','#651067','#329262','#5574a6','#3b3eac','#b77322',
    '#16d620','#b91383','#f4359e','#9c5935','#a9c413','#2a778d','#668d1c',
    '#bea413','#0c5922','#743411'
  ];

  var defaults = {
    tab:0,
    overall0:'show',
    overall1:'hide',
  };

  var state = {};
  $.extend(state,defaults);

  function createQuery(params) {
    var query, key, value;
    for(key in params) {
      value = params[key];
      if(value == defaults[key]) continue;
      if(query) query += '&';
      else query = '';
      query += encodeURIComponent(key)+'='+encodeURIComponent(value);
    }
    return query;
  }

  function getState(key, defVal) {
    return window.sessionStorage.getItem(key) || state[key] || defVal;
  }

  function setState(key, val, showQuery) {
    state[key] = val;
    window.sessionStorage.setItem(key, val);
    if(showQuery) {
      var query = createQuery(state);
      window.history.replaceState({},'',query ? '?' + query : './');
    }
  }

  function setQueryParams(query) {
    var vars, params, i, pair;
    vars = query.split('&');
    params = {};
    for(i = 0; i < vars.length; i++) {
      pair = vars[i].split('=');
      if(pair.length == 2) setState(decodeURIComponent(pair[0]), decodeURIComponent(pair[1]),false);
    }
  }

  var search = window.location.search;
  if(search) setQueryParams(search.substring(1));

  $('#tabs').tabs({
    active: getState('tab', 0),
    activate: function(event, ui) {
      var newIndex = ui.newTab.index();
      setState('tab', newIndex, true);
      $.event.trigger({type:'updateChart'});
    },
    create: function(event,ui) {
      $.event.trigger({type:'updateChart'});
    }
  }); 

  $('#results').hide();

  var db = {};
  $('#bytes').chart({
    type: 'trend',
    metrics: ['bps-counters','bps-flows','bps-load'],
    legend:['Counters','Flows','Load'],
    stack: false,
    colors: colors,
    backgroundColor: backgroundColor,
    units: 'Bits per Second'},
  db);
  $('#frames').chart({
    type: 'trend',
    metrics: ['pps-counters','pps-flows','pps-load'],
    legend:['Counters','Flows','Load'],
    stack: false,
    colors: colors,
    backgroundColor: backgroundColor,
    units: 'Packets per Second'},
  db);

  $.get("../scripts/test.js/agents/json", function(data) {
    $.each(data.agents, function(index,item) {
      $('<option value="'+ item + '">'+item+'</option>').appendTo('#agent');
    });
    if(data.agent) {
      $('#agent').val(data.agent);
    }
    $('#agent').selectmenu({
      change:function() {
        stopPollTestResults();
        $('#results').hide();
      }
    });
  });

  function updateTests(data) {
    var status = $('#results tbody');
    status.empty();
    if(data && data.tests && data.tests.length > 0) {
      for(var r = 0; r < data.tests.length; r++) {
        var entry = data.tests[r];
        var cl;
        switch(entry.status) {
          case 'wait': cl = 'warn'; break;
          case 'fail': cl = 'error'; break;
          case 'pass': cl = 'good'; break;
          default: cl = r%2 === 0 ? 'even' : 'odd';
        }
        var row = $('<tr class="'+cl+'"></tr>');
        row.append('<td>'+entry.status+'</td>');
        row.append('<td>'+entry.name+'</td>');
        row.append('<td>'+ (entry.data ? entry.data : '') + '</td>');
        status.append(row);
      }
    } else {
      status.append('<tr><td colspan="3" class="alignc">No data</td></tr>');
    }
  }

  function updateTrend(data) {
    if(!data 
      || !data.trend 
      || !data.trend.times 
      || data.trend.times.length == 0) return;

    db.trend = data.trend;
    db.trend.start = new Date(db.trend.times[0]);
    db.trend.end = new Date(db.trend.times[db.trend.times.length - 1]);
    $.event.trigger({type:'updateChart'});
  }

  var running_test;
  var timeout_test;
  function pollTestResults() {
    running_test = true;
    $.ajax({
      url: '../scripts/test.js/checks/json',
      //data:db.trend && db.trend.end ? {after:db.trend.end.getTime()} : null,
      success: function(data) {
        if(running_test) {
          updateTests(data);
          updateTrend(data);
          timeout_test = setTimeout(pollTestResults, 1000);
        }
      },
      error: function(result,status,errorThrown) {
        if(running_test) timeout_test = setTimeout(pollTestResults, 2000);
      },
      timeout: 60000
    });
  }

  function stopPollTestResults() {
    running_test = false;
    if(timeout_test) clearTimeout(timeout_test);
  }

  $('#start').button().click(function() {
    var agent = $('#agent').val();
    $.ajax({
      url:'../scripts/test.js/test/json',
      method:'PUT',
      contentType:'application/json',
      data: JSON.stringify({test:'start',agent:agent}),
      success:function() {
        $('#results').show();
        pollTestResults();
      }
    });
  });
  $('#end').button().click(function() {
    $.ajax({
      url:'../scripts/test.js/test/json',
      method:'PUT',
      contentType:'application/json',
      data: JSON.stringify({test:'end'}),
      success: function() { stopPollTestResults(); }
    });
  });
  $('#print').button().click(function() { window.print(); });
});
