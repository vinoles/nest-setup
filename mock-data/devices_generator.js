const { randomUUID } = require('crypto');

function randomInt(max = 1000) {
  return Math.floor(Math.random() * max);
}

function randomBool() {
  return Math.random() > 0.5;
}

function randomString(prefix = 'str') {
  return `${prefix}_${Math.random().toString(36).substring(2, 10)}`;
}

function generateItem(id) {
  return {
    id,
    uid: randomUUID(),
    assignedOwnerUid: randomUUID(),
    parentDeviceId: randomInt(),
    organizationId: randomInt(),
    locationId: randomInt(),
    nodeClass: "WINDOWS_SERVER",
    nodeRoleId: randomInt(),
    rolePolicyId: randomInt(),
    policyId: randomInt(),
    approvalStatus: ["PENDING", "APPROVED", "REJECTED"][randomInt(3)],
    offline: randomBool(),
    displayName: randomString("display"),
    systemName: randomString("system"),
    dnsName: `${randomString("dns")}.local`,
    netbiosName: randomString("netbios"),
    created: Date.now(),
    lastContact: Date.now(),
    lastUpdate: Date.now(),
    userData: {},
    tags: [randomString("tag"), randomString("tag")],
    maintenance: {
      status: ["PENDING", "ACTIVE", "DONE"][randomInt(3)],
      start: Date.now(),
      end: Date.now() + 1000000,
      reasonMessage: randomString("reason")
    },
    references: {
      organization: {
        name: randomString("org"),
        description: randomString("desc"),
        userData: {},
        nodeApprovalMode: "AUTOMATIC",
        id: randomInt()
      },
      location: {
        name: randomString("loc"),
        address: randomString("addr"),
        description: randomString("desc"),
        userData: {},
        id: randomInt()
      },
      rolePolicy: {
        id: randomInt(),
        parentPolicyId: randomInt(),
        name: randomString("rolePolicy"),
        description: randomString("desc"),
        nodeClass: "WINDOWS_SERVER",
        updated: Date.now(),
        nodeClassDefault: true
      },
      policy: {
        id: randomInt(),
        parentPolicyId: randomInt(),
        name: randomString("policy"),
        description: randomString("desc"),
        nodeClass: "WINDOWS_SERVER",
        updated: Date.now(),
        nodeClassDefault: true
      },
      role: {
        id: randomInt(),
        name: randomString("role"),
        description: randomString("desc"),
        nodeClass: "WINDOWS_SERVER",
        custom: true,
        chassisType: "UNKNOWN",
        created: Date.now(),
        nodeRoleParentId: randomInt(),
        icon: randomString("icon")
      },
      backupUsage: {
        revisionsCurrentSize: randomInt(),
        revisionsPreviousSize: randomInt(),
        revisionsDeletedSize: randomInt(),
        localFileFolderSize: randomInt(),
        localImageSize: randomInt(),
        localImageV2Size: randomInt(),
        cloudFileFolderSize: randomInt(),
        cloudImageSize: randomInt(),
        cloudImageV2Size: randomInt(),
        cloudNetworkShareSize: randomInt(),
        lastSuccessfulBackupJob: Date.now(),
        lastFailedBackupJob: Date.now(),
        revisionsTotalSize: randomInt(),
        cloudTotalSize: randomInt(),
        localTotalSize: randomInt()
      },
      warranty: {
        startDate: Date.now(),
        endDate: Date.now() + 100000000,
        manufacturerFulfillmentDate: Date.now()
      },
      assignedOwner: {
        id: randomInt(),
        uid: randomUUID(),
        firstName: randomString("name"),
        lastName: randomString("last"),
        email: `${randomString("user")}@mail.com`,
        phone: `${randomInt(999999999)}`,
        enabled: true,
        administrator: true,
        permitAllClients: true,
        notifyAllClients: true,
        mustChangePw: false,
        mfaConfigured: true,
        userType: "TECHNICIAN",
        invitationStatus: "REGISTERED",
        organizationId: randomInt(),
        deviceIds: [randomInt()],
        assignedDeviceIds: [randomInt()],
        roles: [randomString("role")]
      },
      backupBandwidthThrottle: {
        enabled: true,
        workHoursKbps: randomInt(),
        nonWorkHoursKbps: randomInt(),
        workHoursUserUnit: "kbps",
        nonWorkHoursUserUnit: "kbps",
        workSchedule: {
          endHour: 18,
          endMinute: 0,
          startHour: 9,
          startMinute: 0,
          weekDays: ["MON", "TUE", "WED"]
        }
      }
    }
  };
}

const data = Array.from({ length: 500 }, (_, i) => generateItem(i));

console.log(JSON.stringify(data, null, 2));