import * as path from "node:path";
import { Duration, RemovalPolicy, CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";

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

    const repoRoot = path.join(__dirname, "../..");

    const apiFn = new NodejsFunction(this, "ApiFn", {
      functionName: "smartshop-api",
      entry: path.join(repoRoot, "services/api/src/handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(30),
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
      },
    });

    products.grantReadWriteData(apiFn);
    users.grantReadWriteData(apiFn);
    carts.grantReadWriteData(apiFn);
    orders.grantReadWriteData(apiFn);
    orderNumbers.grantReadWriteData(apiFn);
    conversations.grantReadWriteData(apiFn);

    const jwtAuthorizer = new HttpUserPoolAuthorizer(
      "CognitoJwt",
      userPool,
      { userPoolClients: [userPoolClient] },
    );

    const integration = new HttpLambdaIntegration("ApiIntegration", apiFn);

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
        allowOrigins: ["*"],
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
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration,
      authorizer: jwtAuthorizer,
    });

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

    new s3deploy.BucketDeployment(this, "WebDeploy", {
      sources: [s3deploy.Source.asset(path.join(repoRoot, "web"))],
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
      description: "Placeholder SPA URL",
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
  }
}
