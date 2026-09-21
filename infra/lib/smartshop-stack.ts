import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { DockerImage, Duration, RemovalPolicy, CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import * as agentcore from "aws-cdk-lib/aws-bedrockagentcore";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpIamAuthorizer, HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";
import { INTERNAL_ASSISTANT_TOOLS_PATH, JWT_PROTECTED_METHODS } from "./jwt-proxy-methods";

export class SmartShopStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "smartshop-users",
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient("SpaClient", {
      userPoolClientName: "smartshop-spa",
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      disableOAuth: true,
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    new cognito.CfnUserPoolGroup(this, "AdminGroup", {
      userPoolId: userPool.userPoolId,
      groupName: "admin",
      description: "SmartShop operators",
    });

    const products = new dynamodb.Table(this, "Products", {
      partitionKey: { name: "productId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    products.addGlobalSecondaryIndex({
      indexName: "category-index",
      partitionKey: { name: "category", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "productId", type: dynamodb.AttributeType.STRING },
    });

    const users = new dynamodb.Table(this, "Users", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const carts = new dynamodb.Table(this, "Carts", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "productId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const orders = new dynamodb.Table(this, "Orders", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });
    orders.addGlobalSecondaryIndex({
      indexName: "orderNumber-index",
      partitionKey: { name: "orderNumber", type: dynamodb.AttributeType.STRING },
    });
    orders.addGlobalSecondaryIndex({
      indexName: "orderId-index",
      partitionKey: { name: "orderId", type: dynamodb.AttributeType.STRING },
    });

    const orderNumbers = new dynamodb.Table(this, "OrderNumbers", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const conversations = new dynamodb.Table(this, "Conversations", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const reportJobs = new dynamodb.Table(this, "ReportJobs", {
      partitionKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const repoRoot = path.join(__dirname, "../..");

    const apiLogGroup = new logs.LogGroup(this, "ApiFnLogs", {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const apiFn = new NodejsFunction(this, "ApiFn", {
      functionName: "smartshop-api",
      entry: path.join(repoRoot, "services/api/src/handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(30),
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(repoRoot, "package-lock.json"),
      projectRoot: repoRoot,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
      },
      environment: {
        PRODUCTS_TABLE: products.tableName,
        USERS_TABLE: users.tableName,
        CARTS_TABLE: carts.tableName,
        ORDERS_TABLE: orders.tableName,
        ORDER_NUMBERS_TABLE: orderNumbers.tableName,
        CONVERSATIONS_TABLE: conversations.tableName,
        REPORT_JOBS_TABLE: reportJobs.tableName,
        CURSOR_DASHBOARD_API_KEY: process.env.CURSOR_DASHBOARD_API_KEY ?? "",
        CURSOR_CLOUD_REPO: process.env.CURSOR_CLOUD_REPO ?? "https://github.com/jaganathan-vinod/smartshop",
        CURSOR_CLOUD_REF: process.env.CURSOR_CLOUD_REF ?? "dashboard",
      },
    });

    products.grantReadWriteData(apiFn);
    users.grantReadWriteData(apiFn);
    carts.grantReadWriteData(apiFn);
    orders.grantReadWriteData(apiFn);
    orderNumbers.grantReadWriteData(apiFn);
    conversations.grantReadWriteData(apiFn);
    reportJobs.grantReadWriteData(apiFn);

    const jwtAuthorizer = new HttpUserPoolAuthorizer(
      "CognitoJwt",
      userPool,
      { userPoolClients: [userPoolClient] },
    );

    const integration = new HttpLambdaIntegration("ApiIntegration", apiFn);

    const webBucket = new s3.Bucket(this, "WebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, "WebCdn", {
      comment: "SmartShop SPA",
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(1),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(1),
        },
      ],
    });

    const spaOrigin = `https://${distribution.distributionDomainName}`;

    const assistantUploads = new s3.Bucket(this, "AssistantUploads", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: Duration.days(1), prefix: "" }],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: [spaOrigin],
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
    });
    apiFn.addEnvironment("ASSISTANT_UPLOADS_BUCKET", assistantUploads.bucketName);
    assistantUploads.grantPut(apiFn);
    assistantUploads.grantRead(apiFn);

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "smartshop-api",
      corsPreflight: {
        allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: [spaOrigin],
        maxAge: Duration.days(1),
      },
    });

    httpApi.addRoutes({
      path: "/v1/health",
      methods: [apigwv2.HttpMethod.GET],
      integration,
      authorizer: new apigwv2.HttpNoneAuthorizer(),
    });

    httpApi.addRoutes({
      path: "/v1/products",
      methods: [apigwv2.HttpMethod.GET],
      integration,
      authorizer: new apigwv2.HttpNoneAuthorizer(),
    });

    httpApi.addRoutes({
      path: "/v1/products/{productId}",
      methods: [apigwv2.HttpMethod.GET],
      integration,
      authorizer: new apigwv2.HttpNoneAuthorizer(),
    });

    httpApi.addRoutes({
      path: INTERNAL_ASSISTANT_TOOLS_PATH,
      methods: [apigwv2.HttpMethod.POST],
      integration,
      authorizer: new HttpIamAuthorizer(),
    });

    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: JWT_PROTECTED_METHODS,
      integration,
      authorizer: jwtAuthorizer,
    });

    const assistantRuntime = new agentcore.Runtime(this, "AssistantRuntime", {
      runtimeName: "smartshop_assistant",
      description: "SmartShop text and image shopping assistant",
      agentRuntimeArtifact: agentcore.AgentRuntimeArtifact.fromCodeAsset({
        path: path.join(repoRoot, "services/assistant"),
        runtime: agentcore.AgentCoreRuntime.NODE_22,
        entrypoint: ["server.js"],
        bundling: {
          image: DockerImage.fromRegistry("node:22"),
          local: {
            tryBundle(outputDir: string): boolean {
              execSync(
                `node services/assistant/bundle.mjs ${JSON.stringify(path.join(outputDir, "server.js"))}`,
                { cwd: repoRoot, stdio: "inherit" },
              );
              return true;
            },
          },
          command: [
            "bash",
            "-c",
            "node bundle.mjs /asset-output/server.js",
          ],
        },
      }),
      environmentVariables: {
        SMARTSHOP_API_URL: httpApi.apiEndpoint,
        SMARTSHOP_REGION: this.region,
        // ap-southeast-1 has no on-demand Nova Lite; Converse needs the APAC inference profile.
        BEDROCK_MODEL_ID: "apac.amazon.nova-lite-v1:0",
        ASSISTANT_UPLOADS_BUCKET: assistantUploads.bucketName,
        SPA_ORIGIN: spaOrigin,
      },
      authorizerConfiguration: agentcore.RuntimeAuthorizerConfiguration.usingCognito(
        userPool,
        [userPoolClient],
      ),
    });
    // AgentCore validates JWT at the edge and drops Authorization unless allowlisted.
    // The agent needs that header to copy Cognito `sub` into X-SmartShop-User-Id.
    const cfnRuntime = assistantRuntime.node.defaultChild as agentcore.CfnRuntime;
    cfnRuntime.requestHeaderConfiguration = {
      requestHeaderAllowlist: ["Authorization"],
    };
    assistantRuntime.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["execute-api:Invoke"],
        resources: [httpApi.arnForExecuteApi("POST", INTERNAL_ASSISTANT_TOOLS_PATH)],
      }),
    );
    assistantRuntime.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: ["*"],
      }),
    );
    assistantUploads.grantRead(assistantRuntime.role);

    new cloudwatch.Alarm(this, "ApiFnErrors", {
      alarmName: "smartshop-api-lambda-errors",
      metric: apiFn.metricErrors({
        period: Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "SmartShop API Lambda errors",
    });

    new cloudwatch.Alarm(this, "Api5xx", {
      alarmName: "smartshop-api-5xx",
      metric: httpApi.metricServerError({
        period: Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 3,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "SmartShop HTTP API 5xx responses",
    });

    const webDir = path.join(repoRoot, "web");

    new s3deploy.BucketDeployment(this, "WebDeploy", {
      sources: [
        s3deploy.Source.asset(webDir, {
          exclude: ["node_modules", "dist", ".env", ".env.local"],
          bundling: {
            image: DockerImage.fromRegistry("node:22"),
            local: {
              tryBundle(outputDir: string): boolean {
                execSync("npm run build -w @smartshop/web", {
                  cwd: repoRoot,
                  stdio: "inherit",
                });
                const dist = path.join(webDir, "dist");
                if (!fs.existsSync(dist)) {
                  return false;
                }
                fs.cpSync(dist, outputDir, { recursive: true });
                return true;
              },
            },
            command: [
              "bash",
              "-c",
              "npm ci && npm run build && cp -r dist/* /asset-output/",
            ],
          },
        }),
        s3deploy.Source.jsonData("config.json", {
          apiUrl: httpApi.apiEndpoint,
          userPoolId: userPool.userPoolId,
          userPoolClientId: userPoolClient.userPoolClientId,
          region: this.region,
          assistantRuntimeArn: assistantRuntime.agentRuntimeArn,
        }),
      ],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new CfnOutput(this, "ApiUrl", {
      value: httpApi.apiEndpoint,
      description: "HTTP API base URL",
    });
    new CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "SmartShop SPA URL",
    });
    new CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
    });
    new CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, "UserPoolRegion", {
      value: this.region,
    });
    new CfnOutput(this, "ProductsTableName", {
      value: products.tableName,
    });
    new CfnOutput(this, "UsersTableName", {
      value: users.tableName,
    });
    new CfnOutput(this, "CartsTableName", {
      value: carts.tableName,
    });
    new CfnOutput(this, "OrdersTableName", {
      value: orders.tableName,
    });
    new CfnOutput(this, "OrderNumbersTableName", {
      value: orderNumbers.tableName,
    });
    new CfnOutput(this, "ConversationsTableName", {
      value: conversations.tableName,
    });
    new CfnOutput(this, "AssistantRuntimeArn", {
      value: assistantRuntime.agentRuntimeArn,
      description: "AgentCore Runtime ARN for /chat",
    });
  }
}
