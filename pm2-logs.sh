#!/bin/bash

pm2_args=$@

pm2 logs $pm2_args --raw | yarn pino-pretty --colorize --singleLine --ignore hostname,pid