#!/bin/bash
INPUT=$(cat)
echo "{\"status\":\"ok\",\"config\":{\"timeout\":30,\"retries\":3},\"source\":$INPUT}"
