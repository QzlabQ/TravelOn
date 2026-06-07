2026NULLptr repository that contains both frontend and backend.

## Notice
You need to add file .env under folder travel-api if ai module is needed. The file content are like:

```.env
DEEPSEEK_API_KEY=
AMAP_API_KEY=
DEEPSEEK_MODEL=
```

Frontend AMap JavaScript map rendering is configured separately in `travel-ui/.env`:

```.env
REACT_APP_AMAP_JS_API_KEY=
REACT_APP_AMAP_SECURITY_JS_CODE=
```

`AMAP_API_KEY` is used by backend services for POI / route enrichment. `REACT_APP_AMAP_JS_API_KEY` is used by the browser map component.
