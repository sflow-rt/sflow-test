# Test sFlow agent implementation

Requires sFlow-RT version 2.0-1033 or later.

The tests check for compliance with the sFlow Specifications:
https://sflow.org/developers/specifications.php

The tests also verify that performance is adequate for monitoring data center traffic.

## Install

Copy files to the sFlow-RT app directory and restart to install.

1. [Download sFlow-RT](https://sflow-rt.com/download.php)
2. Run command: `sflow-rt/get-app.sh sflow-rt sflow-test`
3. Restart sFlow-RT

Alternatively, use the Docker image:
https://hub.docker.com/r/sflow/sflow-test/

Online help is available through web UI.

For more information, visit: https://sFlow-RT.com
