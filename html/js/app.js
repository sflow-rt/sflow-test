$(function() { 
  var restPath =  '../scripts/test.js/';
  var agentsPath = restPath+"agents/json";
  var checkPath = restPath+"checks/json";
  var startPath = restPath+"start/json";
  var stopPath = restPath+"stop/json";

  var lastTest;

  function setNav(target) {
    $('.navbar .nav-item a[href="'+target+'"]').parent().addClass('active').siblings().removeClass('active');
    $(target).show().siblings().hide();
    window.sessionStorage.setItem('sflow_test_nav',target);
    window.history.replaceState(null,'',target);
  }

  var hash = window.location.hash;
  if(hash && $('.navbar .nav-item a[href="'+hash+'"]').length == 1) setNav(hash);
  else setNav(window.sessionStorage.getItem('sflow_test_nav') || $('.navbar .nav-item a').first().attr('href'));

  $('.navbar .nav-link').on('click', function(e) {
    var selected = $(this).attr('href');
    setNav(selected);
    if('#test' === selected) $.event.trigger({type:'updateChart'});
  });

  $('a[href^="#"]').on('click', function(e) {
    e.preventDefault();
  });

  function agentSuggestions(q, sync, async) {
    $.getJSON(agentsPath, { search: q }, function(suggestedToken) {
      if(suggestedToken.length === 1 && suggestedToken[0] === q) return;
      var suggestions = [];
      for (var i = 0; i < suggestedToken.length; i++) {
        suggestions.push(suggestedToken[i]); 
      }
      async(suggestions); 
    });
  }

  $('#switch')
    .val('')
    .typeahead(
      {
        highlight: true,
        minLength: 0
      },
      {
        name: 'switch',
        source: agentSuggestions
      }
    )

  $('#results').hide();

  var db = {};
  $('#bytes').chart({
    type: 'trend',
    metrics: ['bps-flows','bps-counters'],
    legend:['Flows','Counters'],
    stack: false,
    units: 'Bits per Second'},
  db);
  $('#frames').chart({
    type: 'trend',
    metrics: ['pps-flows','pps-counters'],
    legend:['Flows','Counters'],
    stack: false,
    units: 'Packets per Second'},
  db);
  $('#samples').chart({
    type: 'trend',
    metrics: ['sample-rate'],
    stack: false,
    units: 'Samples per Second'},
  db);
  $('#drops').chart({
    type: 'topn',
    stack: true,
    includeOther: false,
    metric: 'drop-reasons',
    legendHeadings: ['Drop Reason'],
    units: ['Drops per Seconds']},
  db);

  function updateTests(data) {
    var info = $('#info tbody');
    info.empty();
    if(data && data.tests && data.tests.length > 0) {
      for(var r = 0; r < data.tests.length; r++) {
        var entry = data.tests[r];
        var test_class,test_status;
        switch(entry.status) {
          case 'wait':
            test_class = 'table-warning';
            test_status = 'Waiting';
            break;
          case 'fail':
            test_class = 'table-danger';
            test_status = 'Failed';
            break;
          case 'pass':
            test_class = 'table-success';
            test_status = 'Passed';
            break;
          case 'found':
            test_class = 'table-success';
            test_status = 'Found';
            break;
          case 'notfound':
            test_class = 'table-warning';
            test_status = 'Not Found';
            break;
          default:
            test_class = 'table-light';
            test_status = entry.status;
        }
        var row = $('<tr class="'+test_class+'"></tr>');
        row.append('<td>'+test_status+'</td>');
        row.append('<td>'+entry.descr+'</td>');
        row.append('<td>'+ (entry.data ? entry.data : '') + '</td>');
        info.append(row);
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
          lastTest = data;
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

  $('#start').click(function() {
    var agent = $('#switch').typeahead('val');
    if(!agent) return;

    $('#reset').prop('disabled',true);
    $('#start').prop('disabled',true);
    $('#end').prop('disabled',false);
    $.ajax({
      url:startPath,
      data: { agent: agent },
      success:function() {
        $('#results').show();
        pollTestResults();
      }
    });
  });
  $('#end').click(function() {
    $('#start').prop('disabled',false);
    $('#end').prop('disabled',true);
    $.ajax({
      url:stopPath,
      complete: function() {
        stopPollTestResults();
        $('#reset').prop('disabled',false);
      }
    });
  });
  $('#reset').click(function() {
    $('#switch').typeahead('val','');
    $('#start').prop('disabled',false);
    $('#end').prop('disabled',true);
    $('#results').hide();
  });
});
