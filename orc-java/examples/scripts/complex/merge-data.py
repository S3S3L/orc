#!/usr/bin/env python3
import json, sys

data = json.load(sys.stdin)
userData = data.get("userData", {})
appConfig = data.get("appConfig", {})

merged = {
    "status": "ok",
    "merged": True,
    "users": userData.get("users", []),
    "config": appConfig.get("config", {}),
    "valid": True
}
print(json.dumps(merged))
