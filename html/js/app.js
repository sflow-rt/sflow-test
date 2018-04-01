$(function() { 
  var restPath =  '../scripts/test.js/';
  var agentsPath = restPath+"agents/json";
  var agentPath = restPath+"agent/json";
  var checkPath = restPath+"checks/json";
  var startPath = restPath+"start/json";
  var stopPath = restPath+"stop/json";

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
    metrics: ['bps-counters','bps-flows'],
    legend:['Counters','Flows'],
    stack: false,
    units: 'Bits per Second'},
  db);
  $('#frames').chart({
    type: 'trend',
    metrics: ['pps-counters','pps-flows'],
    legend:['Counters','Flows'],
    stack: false,
    units: 'Packets per Second'},
  db);
  $('#samples').chart({
    type: 'trend',
    metrics: ['sample-rate'],
    stack: false,
    units: 'Samples per Second'},
  db);

  $.get(agentsPath, function(data) {
    $.each(data.agents, function(index,item) {
      $('<option value="'+ item + '">'+item+'</option>').appendTo('#agent');
    });
    if(data.agent) {
      $('#agent').val(data.agent);
    }
    $('#agent').selectmenu({
      change:function() {
        stopPollTestResults();
        $.get(agentPath,{'agent':$('#agent').val()});
        $('#results').hide();
      }
    });
  });

  function updateTests(data) {
    var status = $('#info tbody');
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
        row.append('<td>'+entry.descr+'</td>');
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
      url: checkPath,
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
    $.ajax({
      url:startPath,
      success:function() {
        $('#results').show();
        pollTestResults();
      }
    });
  });
  $('#end').button().click(function() {
    $.ajax({
      url:stopPath,
      success: function() {
        stopPollTestResults();
      }
    });
  });
  $('#print').button().click(function() { window.print(); });
});
