#!/bin/bash

aws s3 sync dist/apps/dashboard/ s3://prod-daytona-dashboard
aws cloudfront create-invalidation --distribution-id E3GMKPSVYPDR26 --paths "/*"