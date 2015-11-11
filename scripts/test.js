// author: InMon Corp.
// version: 0.1
// date: 11/10/2015
// description: Test data center switch sFlow implementation
// copyright: Copyright (c) 2015 InMon Corp. ALL RIGHTS RESERVED

include(scriptdir() + '/inc/trend.js');

Math.sign = Math.sign || function(x) {
  x = +x; // convert to a number
  if (x === 0 || isNaN(x)) {
    return x;
  }
  return x > 0 ? 1 : -1;
}

baselineCreate('bps-error');
baselineCreate('pps-error');
var test = {};
function initializeTest(agt) {
  baselineReset('bps-error');
  baselineReset('pps-error');
  test.agent = agt;
  test.trend = null;
  test.load_bps = 0;
  test.load_pps = 0;
  test.flowInputPorts = {};
  test.flowOutputPorts = {};
  test.flowSizePackets = 0;
  test.flowSizeErrors = 0;
  test.icmpTest = {};
  test.agents = agents();
  test.start = (new Date()).getTime();
}


setFlow('sflow-test-bytes',{value:'bytes',filter:'direction=ingress'});
setFlow('sflow-test-frames',{value:'frames',filter:'direction=ingress'});
setFlow('sflow-test-ports',{keys:'inputifindex,outputifindex',value:'frames',filter:'direction=ingress',log:true, activeTimeout:1});
setFlow('sflow-test-sizes',{keys:'ip_offset,ipbytes,bytes,stripped',value:'frames',filter:'direction=ingress&prefix:stack:.:2=eth.ip',log:true,activeTimeout:1});
setFlow('sflow-test-icmp',{keys:'ipsource,ipdestination,icmptype,icmpseqno',value:'frames',filter:'direction=ingress',log:true,flowStart:true});

function testRandom(signs) {
  // Runs test for detecting non-randomness
  // http://www.itl.nist.gov/div898/handbook/eda/section3/eda35d.htm

  var res = 'unknown';

  var n1 = 0;
  var n2 = 0;
  var runs = 0;
  var prev = 0;
  for(var i = 0; i < signs.length; i++) {
    let sign = signs[i];
    if(sign === 0) continue;

    if(sign !== prev) {
      runs++;
      prev = sign;
    }
    if(sign === 1) n1++;
    else if(sign === -1) n2++; 
  }
  if(n1 > 10 && n2 > 10) {
    var expected_runs = ((2 * n1 * n2) / (n1 + n2)) + 1;
    var sdev_runs = (2 * n1 * n2 * ((2 * n1 * n2) - n1 - n2)) / (Math.pow(n1 + n2,2) * (n1 + n2 - 1));
    var z = Math.abs((expected_runs - runs) / sdev_runs);
    if(z > 1.96) res = 'failed';
    else res = 'passed';
  }
  return res;
}

var PASS='pass';
var FAIL='fail';
var WAIT='wait';
function testResult(name,status,data) {
  var result = {name:name,status:status};
  if(data) result.data = data;
  return result;
}

setFlowHandler(function(rec) {
  if(rec.agent !== test.agent) return;

  switch(rec.name) {
    case 'sflow-test-ports':
      let [input,output] = rec.flowKeys.split(',');
      test.flowInputPorts[input] = true;
      test.flowOutputPorts[output] = true;
      break;
    case 'sflow-test-sizes':
      let [ip_offset,ipbytes,bytes,stripped] = rec.flowKeys.split(',');
      ip_offset = parseInt(ip_offset);
      ipbytes = parseInt(ipbytes);
      bytes = parseInt(bytes);
      stripped = parseInt(stripped);
      if(bytes >= 68) {
        if(bytes != (ip_offset+ipbytes+stripped)) test.flowSizeErrors++;
        else test.flowSizePackets++;
      }
      break;
    case 'sflow-test-icmp':
      let [ipsource,ipdestination,icmptype,icmpseqno] = rec.flowKeys.split(',');
      let testkey = ipsource+','+ipdestination+','+icmptype;
      let seqno = parseInt(icmpseqno);
      let res = test.icmpTest[testkey];
      if(res) {
        let info = datasourceInfo(rec.agent,rec.dataSource);
        if(info) {
          let samplingRate = info.samplingRate;
          if(samplingRate) {
            let predicted = res.seqno + samplingRate;
            let delta = ((seqno < res.seqno ? seqno + 65536 : seqno) - predicted) / samplingRate;
            res.deltas.push(delta);
            if(res.deltas.length > 100) res.deltas.shift();
          }
          let increment = (seqno < res.seqno ? seqno + 65536 : seqno) - res.seqno;
          res.increments.push(increment);
          if(res.increments.length > 100) res.increments.shift();
          res.seqno = seqno; 
        }
      } else {
        res = {seqno:seqno,deltas:[],increments:[]};
        test.icmpTest[testkey] = res;
      }
      break;
  }
},['sflow-test-ports','sflow-test-sizes','sflow-test-icmp']);

function checkAgent(res) {
  var result = {};
  if(!test.agent) return;
  
  var agentsInfo = agents([test.agent]);
  if(!agentsInfo) return;
  var agentInfo = agentsInfo[test.agent];
  if(!agentInfo) return;

  var elapsed = Math.min(agentInfo.firstSeen,(new Date()).getTime() - test.start) / 1000;
  var status = elapsed < 300 ? WAIT : PASS; 
  res.push(testResult("test duration",status,formatNumber(elapsed,"#,##0")));

  var counter, val, prev = test.agents[test.agent];
  var agtErrorCounters = [
    'sFlowDatagramsDuplicates',
    'sFlowDatagramsOutOfOrder',
    'sFlowCounterDuplicateSamples',
    'sFlowCounterOutOfOrderSamples',
    'sFlowFlowDuplicateSamples',
    'sFlowFlowOutOfOrderSamples'
  ]; 
  for each (counter in agtErrorCounters) {
    val = agentInfo[counter];
    if(prev) val -= prev[counter];
    if(val > 0) break;
  }
  res.push(testResult("check sequence numbers", val > 0 ? FAIL : PASS, val > 0 ? counter : formatNumber(prev ? agentInfo['sFlowDatagramsReceived'] - prev['sFlowDatagramsReceived'] : agentInfo['sFlowDatagramsReceived'],'#,###')));
}

function checkDatasources(res) {
  if(!test.agent) return;

  var dataSources = {};
  for each (var m in dump(test.agent,'ALL')) {
     dataSources[m.dataSource] = m.dataSource;
  }
 
  var ds, msg, dir, flow = 0, counter = 0; 
  for(ds in dataSources) {
    let info = datasourceInfo(test.agent,ds);
    if(info.flowSamples) {
      flow++;
      // check against ifSpeed recommended settings
      let ifSpeed = metric(test.agent,ds+'.ifspeed')[0].metricValue;
      if(!ifSpeed) {
        msg = "missing ifspeed for "+ds;
        break;
      } else {
        let targetSamplingRate = Math.round(ifSpeed / 1000000);
        if(info.samplingRate > targetSamplingRate) { 
          let diff = (info.samplingRate - targetSamplingRate) / targetSamplingRate;
          if(diff > 0.4) {
            msg = "incorrect sampling rate setting for "+ds;
            break;
          }
        }
        let diff = Math.abs((info.effectiveSamplingRate - info.samplingRate) / info.samplingRate);
        if(diff > 0.1) {
          msg = "packet loss or inconsistent sample pool for "+ds;
          break;
        }
      }
      if(dir) {
        if(info.samplingDirection !== dir) {
          msg = "inconsistent sampling direction";
          break;
        } 
      } else dir = info.samplingDirection;
      if('egress' === info.samplingDirection) {
        msg = "egress sampling for "+ds;
        break;
      }
    }
    if(info.counterSamples) {
      counter++;
      if(info.effectivePollingInterval > 25000) {
        msg = "polling interval for "+ds;
      } 
    }
  }
  res.push(testResult("check data sources", msg ? FAIL : PASS, msg ? msg : "counter="+counter+" flow="+flow));
}

function checkFlowSize(res) {
  var status, msg;
  if(test.flowSizeErrors) {
    status = FAIL;
    msg = "bad samples="+test.flowSizeErrors;
  } else if(test.flowSizePackets < 100) {
    status = WAIT;
    msg = "samples="+test.flowSizePackets;
  } else {
    status = PASS;
    msg = "sampled="+test.flowSizePackets;
  }
  res.push(testResult("sampled packet size",status,msg)); 
}

function checkRandomness(res) {
  if(!test.icmpTest) return;

  var passed = 0;
  var failed = 0;
  for(var key in test.icmpTest) {
    var entry = test.icmpTest[key];
    var result = testRandom(entry.deltas.map(function(x) Math.sign(x)));
    switch(result) {
      case 'passed':
        passed++;
        break;
      case 'failed':
        failed++;
        break;
      case 'unknown':
        break;    
    }
    result = testRandom(entry.increments.map(function(x) x % 2 === 0 ? 1 : -1));
    switch(result) {
      case 'passed':
        passed++;
        break;
      case 'failed':
        failed++;
        break;
      case 'unknown':
        break;
    } 
  }
  res.push(testResult("random number generator", failed > 0 ? FAILED : (passed === 0 ? WAIT : PASS),"passed="+passed+" failed="+failed));
}

function checkBias(res) {
  var stats,status,min,max,msg;
  stats = baselineStatistics('bps-error');
  if(stats) {
    min = stats.mean - (1.96 * stats.sdev);
    max = stats.mean + (1.96 * stats.sdev);
    msg = "min="+formatNumber(min,'#,##0')+" max="+formatNumber(max,'#,##0');
    if(min < 0 && max > 0) status = PASS;
    else status = FAIL;
  } else {
    msg = null;
    status = WAIT;
  }
  res.push(testResult("compare byte flows and counters",status,msg));
  stats = baselineStatistics('pps-error');
  if(stats) {
    min = stats.mean - (1.96 * stats.sdev);
    max = stats.mean + (1.96 * stats.sdev);
    msg = "min="+formatNumber(min,'#,##0')+" max="+formatNumber(max,'#,##0'); 
    if(min < 0 && max > 0) status = PASS;
    else status = FAIL;
  } else {
    msg = null;
    status = WAIT;
  }
  res.push(testResult("compare packet flows and counters",status,msg));
}

function checkIngressPorts(res) {
  var status, count = 0, matchedPortCount = 0, inputPortCount = 0;
  if(test.flowInputPorts) {
    for(var prt in test.flowInputPorts) {
      count++;
      if('internal' === prt || 'multiple' === prt || '0' === prt) continue;
      inputPortCount++;
      if(test.flowOutputPorts[prt]) matchedPortCount++;
    }
  }
  if(count === 0) status = WAIT;
  else if(inputPortCount > 0) status = PASS;
  else status = FAIL;
  res.push(testResult("check ingress port information",status,"ingress="+inputPortCount+" egress="+matchedPortCount));
}

setIntervalHandler(function() {
  if(!test.agent) return;
  if(!test.trend) test.trend = new Trend(300,1);

  var points = {};

  var res = metric(test.agent,'sum:ifinoctets,sum:sflow-test-bytes,sum:ifinpkts,sum:sflow-test-frames');
  if(!res) return;

  points['bps-counters'] = (res[0].metricValue || 0) * 8;
  points['bps-flows'] = (res[1].metricValue || 0) * 8;
  points['bps-load'] = test.load_bps;
  points['pps-counters'] = res[2].metricValue || 0;
  points['pps-flows'] = res[3].metricValue || 0;
  points['pps-load'] = test.load_pps;
  test.trend.addPoints(points);

  // calculate difference between counters and flows
  var bps_diff = points['bps-counters'] - points['bps-flows'];
  var pps_diff = points['pps-counters'] - points['pps-flows'];
  
  baselineCheck('bps-error',bps_diff);
  baselineCheck('pps-error',pps_diff);  
},1);

setHttpHandler(function(req) {
  var result, tests, path = req.path;
  if(!path || path.length !== 1) throw "not_found";

  switch(path[0]) {
    case 'agents':
      result = {agents:[]};
      if(test.agent) result.agent = test.agent;
      for(let agt in agents()) result.agents.push(agt);
      result.agents.sort();
      break;
    case 'test':
      if('start' === req.body.test) initializeTest(req.body.agent);
      break;
    case 'load':
      test.load_bps = req.query.bps && parseInt(req.query.bps) || 0;
      test.load_pps = req.query.pps && parseInt(req.query.pps) || 0;
      break;
    case 'checks':
      result = {};
      if(test.trend) result.trend = req.query.after ? test.trend.after(parseInt(req.query.after)) : test.trend;
     
      tests = []; 
      checkAgent(tests);
      checkDatasources(tests);
      checkFlowSize(tests);
      checkRandomness(tests);
      checkBias(tests);
      checkIngressPorts(tests);
      result.tests = tests;
      break;
    default:
      throw "not_found";
  }

  return result;
});
