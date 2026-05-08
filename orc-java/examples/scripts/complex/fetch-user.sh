#!/bin/bash
INPUT=$(cat)
echo "{\"status\":\"ok\",\"users\":[{\"id\":1,\"name\":\"Alice\"},{\"id\":2,\"name\":\"Bob\"}],\"source\":$INPUT}"
