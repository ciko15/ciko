const templateService = require('./src/services/template');
const thresholdEvaluator = require('./src/utils/thresholdEvaluator');

async function fullTest() {
  console.log('=== TEMPLATE PARAMETER SYSTEM TEST ===\n');
  
  // Test 1: Load templates with parameters
  console.log('1. Loading templates with parameters...');
  const templates = await templateService.getAllTemplates();
  const template1 = templates.find(t => t.id === 1);
  const template2 = templates.find(t => t.id === 2);
  
  if (template1) {
    console.log('   Template 1 (DME L-3):', template1.name);
    console.log('   - Parameters:', template1.parameters.length);
    template1.parameters.forEach(p => {
      console.log('     * ' + p.label + ' (' + p.source + '): warning_min=' + p.warning_min + ', alarm_min=' + p.alarm_min);
    });
  }
  
  if (template2) {
    console.log('\n   Template 2 (DVOR L-3):', template2.name);
    console.log('   - Parameters:', template2.parameters.length);
    template2.parameters.forEach(p => {
      console.log('     * ' + p.label + ' (' + p.source + '): warning_min=' + p.warning_min + ', alarm_min=' + p.alarm_min);
    });
  }
  
  // Test 2: Threshold evaluation
  console.log('\n2. Testing threshold evaluation...');
  
  // Test case 1: Normal value
  let result = thresholdEvaluator.checkThreshold(80, { warning_min: 75, alarm_min: 70 });
  console.log('   Value: 80, Thresholds: warning_min=75, alarm_min=70 --> Status: ' + result);
  
  // Test case 2: Warning value
  result = thresholdEvaluator.checkThreshold(74, { warning_min: 75, alarm_min: 70 });
  console.log('   Value: 74, Thresholds: warning_min=75, alarm_min=70 --> Status: ' + result);
  
  // Test case 3: Alarm value
  result = thresholdEvaluator.checkThreshold(69, { warning_min: 75, alarm_min: 70 });
  console.log('   Value: 69, Thresholds: warning_min=75, alarm_min=70 --> Status: ' + result);
  
  // Test 3: Multi-parameter evaluation
  console.log('\n3. Testing multi-parameter evaluation...');
  const paramValues = {
    'm1_reply_eff': 72,
    'm1_fwd_power': 850
  };
  const thresholds = {
    'm1_reply_eff': { warning_min: 75, alarm_min: 70 },
    'm1_fwd_power': { warning_min: 850, alarm_min: 800 }
  };
  
  const evaluation = thresholdEvaluator.evaluateParameters(paramValues, thresholds);
  console.log('   Parameter values: m1_reply_eff=72, m1_fwd_power=850');
  console.log('   Results:');
  console.log('     - m1_reply_eff: ' + evaluation.parameterStatuses.m1_reply_eff);
  console.log('     - m1_fwd_power: ' + evaluation.parameterStatuses.m1_fwd_power);
  console.log('     - Overall Status: ' + evaluation.overallStatus);
  
  console.log('\n✓ All tests completed successfully!');
}

fullTest().catch(console.error);
