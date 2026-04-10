#!/usr/bin/env python3
import json
import sys
input_data = json.load(sys.stdin)
print(json.dumps({"received": input_data, "source": "python"}))
