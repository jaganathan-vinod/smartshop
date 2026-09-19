#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { SmartShopStack } from "../lib/smartshop-stack";

const app = new cdk.App();

new SmartShopStack(app, "SmartShopStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.SMARTSHOP_REGION ?? "ap-southeast-1",
  },
  description:
    "SmartShop Phase 0 foundation: Cognito, HTTP API, DynamoDB, CloudFront",
});
