import {readFile,writeFile} from "node:fs/promises";
import assert from "node:assert/strict";
const read=async name=>JSON.parse(await readFile(`docs/evidence/stage10-${name}.json`,"utf8"));
const [checks,browser,chrome,edge,events,update,capacity,restart,repository,devices]=await Promise.all(["checks","browser","chrome-offline","edge-offline","application-events","update","capacity","restart","repository-environment","device-check"].map(read));
for(const r of [checks,browser,chrome,edge,events,update,capacity,restart,repository])assert.equal(r.completed,true);
const build=checks.webBuild;for(const version of [browser.build,chrome.build.version,edge.build.version,events.build,update.newBuild,restart.build,repository.webBuild])assert.equal(version,build);
assert.equal(checks.tests.failed,0);assert.equal(repository.lockfileChanged,false);assert.equal(repository.ignoredTracked.length,0);
const p95=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
const summary={generatedAtUtc:new Date().toISOString(),appVersion:"0.1.0",webBuild:build,serverSourceSha256:repository.serverSourceSha256,tests:checks.tests,
  browsers:{chrome:browser.chrome,edge:browser.edge,android:null},syntheticLoad:{sessions:capacity.authenticatedSessions,games:capacity.activeGames,session41Rejected:capacity.session41Rejected,ackSamples:capacity.syntheticClientAck.count,ackP95Ms:capacity.syntheticClientAck.p95Ms,scope:capacity.syntheticClientAck.measurement},
  browserTiming:{ackChrome:{count:browser.timingA.ack.length,p95Ms:p95(browser.timingA.ack)},ackEdge:{count:browser.timingB.ack.length,p95Ms:p95(browser.timingB.ack)},receiptToDomChrome:{count:browser.timingA.receiptToDom.length,p95Ms:p95(browser.timingA.receiptToDom.map(s=>s.elapsedMs))},receiptToDomEdge:{count:browser.timingB.receiptToDom.length,p95Ms:p95(browser.timingB.receiptToDom.map(s=>s.elapsedMs))},scope:browser.timingScope},
  botObservedMaxMs:{chrome:chrome.observedBotMaxRoundTripMs,edge:edge.observedBotMaxRoundTripMs},pngDownloadedAndOpened:browser.actualPngDownloadedAndOpened,pngFailureInjectedAndRetried:browser.injectedPngFailureRetainedResult,repositoryPassed:true,
  physicalPairs:{pcPc:"NOT_RUN",pcAndroid:"NOT_RUN",androidAndroid:"NOT_RUN"},androidInventory:devices.adbDevices,trustedHttpsVerified:devices.trustedHttpsVerified,externalPerformanceTarget:"NOT_VERIFIED: actual <=100ms RTT condition, external loss and sender-to-opponent physical paint not measured",allRecordedSoftwareChecksPassed:true};
await writeFile("docs/evidence/stage10-summary.json",JSON.stringify(summary,null,2));console.log(JSON.stringify({build,tests:summary.tests,ackP95Ms:summary.syntheticLoad.ackP95Ms,physicalPairs:summary.physicalPairs}));
