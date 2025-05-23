import { Construct } from 'constructs';
import { CfnTrail } from './cloudtrail.generated';
import * as events from '../../aws-events';
import * as iam from '../../aws-iam';
import * as kms from '../../aws-kms';
import * as lambda from '../../aws-lambda';
import * as logs from '../../aws-logs';
import * as s3 from '../../aws-s3';
import * as sns from '../../aws-sns';
import { Resource, Stack, ValidationError } from '../../core';
import { addConstructMetadata, MethodMetadata } from '../../core/lib/metadata-resource';
import { propertyInjectable } from '../../core/lib/prop-injectable';

/**
 * Properties for an AWS CloudTrail trail
 */
export interface TrailProps {
  /**
   * For most services, events are recorded in the region where the action occurred.
   * For global services such as AWS Identity and Access Management (IAM), AWS STS, Amazon CloudFront, and Route 53,
   * events are delivered to any trail that includes global services, and are logged as occurring in US East (N. Virginia) Region.
   *
   * @default true
   */
  readonly includeGlobalServiceEvents?: boolean;

  /**
   * Whether or not this trail delivers log files from multiple regions to a single S3 bucket for a single account.
   *
   * @default true
   */
  readonly isMultiRegionTrail?: boolean;

  /**
   * When an event occurs in your account, CloudTrail evaluates whether the event matches the settings for your trails.
   * Only events that match your trail settings are delivered to your Amazon S3 bucket and Amazon CloudWatch Logs log group.
   *
   * This method sets the management configuration for this trail.
   *
   * Management events provide insight into management operations that are performed on resources in your AWS account.
   * These are also known as control plane operations.
   * Management events can also include non-API events that occur in your account.
   * For example, when a user logs in to your account, CloudTrail logs the ConsoleLogin event.
   *
   * @param managementEvents the management configuration type to log
   *
   * @default ReadWriteType.ALL
   */
  readonly managementEvents?: ReadWriteType;

  /**
   * To determine whether a log file was modified, deleted, or unchanged after CloudTrail delivered it,
   * you can use CloudTrail log file integrity validation.
   * This feature is built using industry standard algorithms: SHA-256 for hashing and SHA-256 with RSA for digital signing.
   * This makes it computationally infeasible to modify, delete or forge CloudTrail log files without detection.
   * You can use the AWS CLI to validate the files in the location where CloudTrail delivered them.
   *
   * @default true
   */
  readonly enableFileValidation?: boolean;

  /**
   * If CloudTrail pushes logs to CloudWatch Logs in addition to S3.
   * Disabled for cost out of the box.
   *
   * @default false
   */
  readonly sendToCloudWatchLogs?: boolean;

  /**
   * How long to retain logs in CloudWatchLogs.
   * Ignored if sendToCloudWatchLogs is false or if cloudWatchLogGroup is set.
   *
   *  @default logs.RetentionDays.ONE_YEAR
   */
  readonly cloudWatchLogsRetention?: logs.RetentionDays;

  /**
   * Log Group to which CloudTrail to push logs to. Ignored if sendToCloudWatchLogs is set to false.
   * @default - a new log group is created and used.
   */
  readonly cloudWatchLogGroup?: logs.ILogGroup;

  /** The AWS Key Management Service (AWS KMS) key ID that you want to use to encrypt CloudTrail logs.
   * @default - No encryption.
   * @deprecated - use encryptionKey instead.
   */
  readonly kmsKey?: kms.IKey;

  /** The AWS Key Management Service (AWS KMS) key ID that you want to use to encrypt CloudTrail logs.
   *
   * @default - No encryption.
   */
  readonly encryptionKey?: kms.IKey;

  /** SNS topic that is notified when new log files are published.
   *
   * @default - No notifications.
   */
  readonly snsTopic?: sns.ITopic;

  /**
   * The name of the trail. We recommend customers do not set an explicit name.
   *
   * @default - AWS CloudFormation generated name.
   */
  readonly trailName?: string;

  /** An Amazon S3 object key prefix that precedes the name of all log files.
   *
   * @default - No prefix.
   */
  readonly s3KeyPrefix?: string;

  /** The Amazon S3 bucket
   *
   * @default - if not supplied a bucket will be created with all the correct permisions
   */
  readonly bucket?: s3.IBucket;

  /**
   * Specifies whether the trail is applied to all accounts in an organization in AWS Organizations, or only for the current AWS account.
   *
   * If this is set to true then the current account _must_ be the management account. If it is not, then CloudFormation will throw an error.
   *
   * If this is set to true and the current account is a management account for an organization in AWS Organizations, the trail will be created in all AWS accounts that belong to the organization.
   * If this is set to false, the trail will remain in the current AWS account but be deleted from all member accounts in the organization.
   *
   * @default - false
   */
  readonly isOrganizationTrail?: boolean;

  /** The orgId.
   *
   * Required when `isOrganizationTrail` is set to true to attach the necessary permissions.
   *
   * @default - No orgId
   */
  readonly orgId?: string;

  /**
   * A JSON string that contains the insight types you want to log on a trail.
   *
   * @default - No Value.
   */
  readonly insightTypes?: InsightType[];
}

/**
 * Types of events that CloudTrail can log
 */
export enum ReadWriteType {
  /**
   * Read-only events include API operations that read your resources,
   * but don't make changes.
   * For example, read-only events include the Amazon EC2 DescribeSecurityGroups
   * and DescribeSubnets API operations.
   */
  READ_ONLY = 'ReadOnly',
  /**
   * Write-only events include API operations that modify (or might modify)
   * your resources.
   * For example, the Amazon EC2 RunInstances and TerminateInstances API
   * operations modify your instances.
   */
  WRITE_ONLY = 'WriteOnly',
  /**
   * All events
   */
  ALL = 'All',

  /**
   * No events
   */
  NONE = 'None',
}

/**
 * Util element for InsightSelector
 */
export class InsightType {
  /**
   * The type of insights to log on a trail. (API Call Rate)
   */
  public static readonly API_CALL_RATE = new InsightType('ApiCallRateInsight');

  /**
   * The type of insights to log on a trail. (API Error Rate)
   */
  public static readonly API_ERROR_RATE = new InsightType('ApiErrorRateInsight');

  protected constructor(public readonly value: string) {}
}

/**
 * Cloud trail allows you to log events that happen in your AWS account
 * For example:
 *
 * import { CloudTrail } from 'aws-cdk-lib/aws-cloudtrail'
 *
 * const cloudTrail = new CloudTrail(this, 'MyTrail');
 *
 */
@propertyInjectable
export class Trail extends Resource {
  /**
   * Uniquely identifies this class.
   */
  public static readonly PROPERTY_INJECTION_ID: string = 'aws-cdk-lib.aws-cloudtrail.Trail';

  /**
   * Create an event rule for when an event is recorded by any Trail in the account.
   *
   * Note that the event doesn't necessarily have to come from this Trail, it can
   * be captured from any one.
   *
   * Be sure to filter the event further down using an event pattern.
   */
  public static onEvent(scope: Construct, id: string, options: events.OnEventOptions = {}): events.Rule {
    const rule = new events.Rule(scope, id, options);
    rule.addTarget(options.target);
    rule.addEventPattern({
      detailType: ['AWS API Call via CloudTrail'],
    });
    return rule;
  }

  /**
   * ARN of the CloudTrail trail
   * i.e. arn:aws:cloudtrail:us-east-2:123456789012:trail/myCloudTrail
   * @attribute
   */
  public readonly trailArn: string;

  /**
   * ARN of the Amazon SNS topic that's associated with the CloudTrail trail,
   * i.e. arn:aws:sns:us-east-2:123456789012:mySNSTopic
   * @attribute
   */
  public readonly trailSnsTopicArn: string;

  /**
   * The CloudWatch log group to which CloudTrail events are sent.
   * `undefined` if `sendToCloudWatchLogs` property is false.
   */
  public readonly logGroup?: logs.ILogGroup;

  private s3bucket: s3.IBucket;
  private managementEvents: ReadWriteType | undefined;
  private eventSelectors: EventSelector[] = [];
  private topic: sns.ITopic | undefined;
  private insightTypeValues: InsightSelector[] | undefined;

  constructor(scope: Construct, id: string, props: TrailProps = {}) {
    super(scope, id, {
      physicalName: props.trailName,
    });
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    const cloudTrailPrincipal = new iam.ServicePrincipal('cloudtrail.amazonaws.com');

    this.s3bucket = props.bucket || new s3.Bucket(this, 'S3', { enforceSSL: true });

    this.s3bucket.addToResourcePolicy(new iam.PolicyStatement({
      resources: [this.s3bucket.bucketArn],
      actions: ['s3:GetBucketAcl'],
      principals: [cloudTrailPrincipal],
    }));

    this.s3bucket.addToResourcePolicy(new iam.PolicyStatement({
      resources: [this.s3bucket.arnForObjects(
        `${props.s3KeyPrefix ? `${props.s3KeyPrefix}/` : ''}AWSLogs/${Stack.of(this).account}/*`,
      )],
      actions: ['s3:PutObject'],
      principals: [cloudTrailPrincipal],
      conditions: {
        StringEquals: { 's3:x-amz-acl': 'bucket-owner-full-control' },
      },
    }));

    if (props.isOrganizationTrail) {
      this.s3bucket.addToResourcePolicy(new iam.PolicyStatement({
        resources: [this.s3bucket.arnForObjects(
          `AWSLogs/${props.orgId}/*`,
        )],
        actions: ['s3:PutObject'],
        principals: [cloudTrailPrincipal],
        conditions: {
          StringEquals: {
            's3:x-amz-acl': 'bucket-owner-full-control',
            'aws:SourceArn': `arn:${this.stack.partition}:cloudtrail:${this.s3bucket.stack.region}:${this.s3bucket.stack.account}:trail/${props.trailName}`,
          },
        },
      }));
    }

    this.topic = props.snsTopic;
    if (this.topic) {
      this.topic.grantPublish(cloudTrailPrincipal);
    }

    let logsRole: iam.IRole | undefined;

    if (props.sendToCloudWatchLogs) {
      if (props.cloudWatchLogGroup) {
        this.logGroup = props.cloudWatchLogGroup;
      } else {
        this.logGroup = new logs.LogGroup(this, 'LogGroup', {
          retention: props.cloudWatchLogsRetention ?? logs.RetentionDays.ONE_YEAR,
        });
      }

      logsRole = new iam.Role(this, 'LogsRole', { assumedBy: cloudTrailPrincipal });

      logsRole.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['logs:PutLogEvents', 'logs:CreateLogStream'],
        resources: [this.logGroup.logGroupArn],
      }));
    }

    this.managementEvents = props.managementEvents;
    if (this.managementEvents && this.managementEvents !== ReadWriteType.NONE) {
      this.eventSelectors.push({
        includeManagementEvents: true,
        readWriteType: props.managementEvents,
      });
    }
    this.node.addValidation({ validate: () => this.validateEventSelectors() });

    if (props.kmsKey && props.encryptionKey) {
      throw new ValidationError('Both kmsKey and encryptionKey must not be specified. Use only encryptionKey', this);
    }

    if (props.insightTypes) {
      this.insightTypeValues = props.insightTypes.map(function(t) {
        return { insightType: t.value };
      });
    }

    // TODO: not all regions support validation. Use service configuration data to fail gracefully
    const trail = new CfnTrail(this, 'Resource', {
      isLogging: true,
      enableLogFileValidation: props.enableFileValidation == null ? true : props.enableFileValidation,
      isMultiRegionTrail: props.isMultiRegionTrail == null ? true : props.isMultiRegionTrail,
      includeGlobalServiceEvents: props.includeGlobalServiceEvents == null ? true : props.includeGlobalServiceEvents,
      trailName: this.physicalName,
      kmsKeyId: props.encryptionKey?.keyArn ?? props.kmsKey?.keyArn,
      s3BucketName: this.s3bucket.bucketName,
      s3KeyPrefix: props.s3KeyPrefix,
      cloudWatchLogsLogGroupArn: this.logGroup?.logGroupArn,
      cloudWatchLogsRoleArn: logsRole?.roleArn,
      snsTopicName: this.topic?.topicName,
      eventSelectors: this.eventSelectors,
      isOrganizationTrail: props.isOrganizationTrail,
      insightSelectors: this.insightTypeValues,
    });

    this.trailArn = this.getResourceArnAttribute(trail.attrArn, {
      service: 'cloudtrail',
      resource: 'trail',
      resourceName: this.physicalName,
    });
    this.trailSnsTopicArn = trail.attrSnsTopicArn;

    // Add a dependency on the bucket policy being updated, CloudTrail will test this upon creation.
    if (this.s3bucket.policy) {
      trail.node.addDependency(this.s3bucket.policy);
    }

    // If props.sendToCloudWatchLogs is set to true then the trail needs to depend on the created logsRole
    // so that it can create the log stream for the log group. This ensures the logsRole is created and propagated
    // before the trail tries to create the log stream.
    if (logsRole !== undefined) {
      trail.node.addDependency(logsRole);
    }
  }

  /**
   * When an event occurs in your account, CloudTrail evaluates whether the event matches the settings for your trails.
   * Only events that match your trail settings are delivered to your Amazon S3 bucket and Amazon CloudWatch Logs log group.
   *
   * This method adds an Event Selector for filtering events that match either S3 or Lambda function operations.
   *
   * Data events: These events provide insight into the resource operations performed on or within a resource.
   * These are also known as data plane operations.
   *
   * @param dataResourceValues the list of data resource ARNs to include in logging (maximum 250 entries).
   * @param options the options to configure logging of management and data events.
   */
  @MethodMetadata()
  public addEventSelector(dataResourceType: DataResourceType, dataResourceValues: string[], options: AddEventSelectorOptions = {}) {
    if (dataResourceValues.length > 250) {
      throw new ValidationError('A maximum of 250 data elements can be in one event selector', this);
    }

    if (this.eventSelectors.length > 5) {
      throw new ValidationError('A maximum of 5 event selectors are supported per trail.', this);
    }

    let includeAllManagementEvents;
    if (this.managementEvents === ReadWriteType.NONE) {
      includeAllManagementEvents = false;
    }

    this.eventSelectors.push({
      dataResources: [{
        type: dataResourceType,
        values: dataResourceValues,
      }],
      includeManagementEvents: options.includeManagementEvents ?? includeAllManagementEvents,
      excludeManagementEventSources: options.excludeManagementEventSources,
      readWriteType: options.readWriteType,
    });
  }

  /**
   * When an event occurs in your account, CloudTrail evaluates whether the event matches the settings for your trails.
   * Only events that match your trail settings are delivered to your Amazon S3 bucket and Amazon CloudWatch Logs log group.
   *
   * This method adds a Lambda Data Event Selector for filtering events that match Lambda function operations.
   *
   * Data events: These events provide insight into the resource operations performed on or within a resource.
   * These are also known as data plane operations.
   *
   * @param handlers the list of lambda function handlers whose data events should be logged (maximum 250 entries).
   * @param options the options to configure logging of management and data events.
   */
  @MethodMetadata()
  public addLambdaEventSelector(handlers: lambda.IFunction[], options: AddEventSelectorOptions = {}) {
    if (handlers.length === 0) { return; }
    const dataResourceValues = handlers.map((h) => h.functionArn);
    return this.addEventSelector(DataResourceType.LAMBDA_FUNCTION, dataResourceValues, options);
  }

  /**
   * Log all Lambda data events for all lambda functions the account.
   * @see https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html
   * @default false
   */
  @MethodMetadata()
  public logAllLambdaDataEvents(options: AddEventSelectorOptions = {}) {
    return this.addEventSelector(DataResourceType.LAMBDA_FUNCTION, [`arn:${this.stack.partition}:lambda`], options);
  }

  /**
   * When an event occurs in your account, CloudTrail evaluates whether the event matches the settings for your trails.
   * Only events that match your trail settings are delivered to your Amazon S3 bucket and Amazon CloudWatch Logs log group.
   *
   * This method adds an S3 Data Event Selector for filtering events that match S3 operations.
   *
   * Data events: These events provide insight into the resource operations performed on or within a resource.
   * These are also known as data plane operations.
   *
   * @param s3Selector the list of S3 bucket with optional prefix to include in logging (maximum 250 entries).
   * @param options the options to configure logging of management and data events.
   */
  @MethodMetadata()
  public addS3EventSelector(s3Selector: S3EventSelector[], options: AddEventSelectorOptions = {}) {
    if (s3Selector.length === 0) { return; }
    const dataResourceValues = s3Selector.map((sel) => `${sel.bucket.bucketArn}/${sel.objectPrefix ?? ''}`);
    return this.addEventSelector(DataResourceType.S3_OBJECT, dataResourceValues, options);
  }

  /**
   * Log all S3 data events for all objects for all buckets in the account.
   * @see https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-data-events-with-cloudtrail.html
   * @default false
   */
  @MethodMetadata()
  public logAllS3DataEvents(options: AddEventSelectorOptions = {}) {
    return this.addEventSelector(DataResourceType.S3_OBJECT, [`arn:${this.stack.partition}:s3:::`], options);
  }

  /**
   * Create an event rule for when an event is recorded by any Trail in the account.
   *
   * Note that the event doesn't necessarily have to come from this Trail, it can
   * be captured from any one.
   *
   * Be sure to filter the event further down using an event pattern.
   *
   * @deprecated - use Trail.onEvent()
   */
  @MethodMetadata()
  public onCloudTrailEvent(id: string, options: events.OnEventOptions = {}): events.Rule {
    return Trail.onEvent(this, id, options);
  }

  private validateEventSelectors(): string[] {
    const errors: string[] = [];
    // Ensure that there is at least one event selector when management events are set to None
    if (this.managementEvents === ReadWriteType.NONE && this.eventSelectors.length === 0) {
      errors.push('At least one event selector must be added when management event recording is set to None');
    }
    return errors;
  }
}

/**
 * Options for adding an event selector.
 */
export interface AddEventSelectorOptions {
  /**
   * Specifies whether to log read-only events, write-only events, or all events.
   *
   * @default ReadWriteType.All
   */
  readonly readWriteType?: ReadWriteType;

  /**
   * Specifies whether the event selector includes management events for the trail.
   *
   * @default true
   */
  readonly includeManagementEvents?: boolean;

  /**
   * An optional list of service event sources from which you do not want management events to be logged on your trail.
   *
   * @default []
   */
  readonly excludeManagementEventSources?: ManagementEventSources[];
}

/**
 * Types of management event sources that can be excluded
 */
export enum ManagementEventSources {
  /**
   * AWS Key Management Service (AWS KMS) events
   */
  KMS = 'kms.amazonaws.com',

  /**
   * Data API events
   */
  RDS_DATA_API = 'rdsdata.amazonaws.com',
}

/**
 * Selecting an S3 bucket and an optional prefix to be logged for data events.
 */
export interface S3EventSelector {
  /** S3 bucket */
  readonly bucket: s3.IBucket;

  /**
   * Data events for objects whose key matches this prefix will be logged.
   * @default - all objects
   */
  readonly objectPrefix?: string;
}

/**
 * Resource type for a data event
 */
export enum DataResourceType {
  /**
   * Data resource type for Lambda function
   */
  LAMBDA_FUNCTION = 'AWS::Lambda::Function',

  /**
   * Data resource type for S3 objects
   */
  S3_OBJECT = 'AWS::S3::Object',
}

interface EventSelector {
  readonly includeManagementEvents?: boolean;
  readonly excludeManagementEventSources?: string[];
  readonly readWriteType?: ReadWriteType;
  readonly dataResources?: EventSelectorData[];
}

interface EventSelectorData {
  readonly type: string;
  readonly values: string[];
}

interface InsightSelector {
  readonly insightType?: string;
}
