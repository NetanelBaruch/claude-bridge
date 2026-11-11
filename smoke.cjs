const {runTests}=require('@vscode/test-electron');
const path=require('node:path');
runTests({vscodeExecutablePath:'/usr/share/code/code',extensionDevelopmentPath:path.resolve(__dirname),extensionTestsPath:path.resolve(__dirname,'extension-host.cjs'),launchArgs:['/downloads/bridge-fixture','--no-sandbox','--disable-gpu','--disable-workspace-trust','--skip-welcome','--skip-release-notes','--password-store=basic','--user-data-dir=/tmp/bridge-vscode-smoke','--extensions-dir=/tmp/bridge-vscode-extensions']}).then(()=>console.log('SMOKE PASSED')).catch(e=>{console.error(e);process.exit(1)});
