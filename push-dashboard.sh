#!/bin/bash

## If serving dashboard from /
# aws s3 sync dist/apps/dashboard/ s3://prod-daytona-dashboard
# aws cloudfront create-invalidation --distribution-id E3GMKPSVYPDR26 --paths "/*"

## If serving dashboard from /dashboard - make sure to build docs with VITE_BASE_PATH=/dashboard/ 
aws s3 sync dist/apps/dashboard/ s3://prod-daytona-dashboard/dashboard --delete
aws cloudfront create-invalidation --distribution-id E3GMKPSVYPDR26 --paths "/*"