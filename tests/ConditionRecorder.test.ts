import { describe, it, expect, beforeEach } from "vitest";
import { bufferCV, stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PRODUCT_ID = 101;
const ERR_PRODUCT_NOT_FOUND = 104;
const ERR_ORACLE_NOT_VERIFIED = 105;
const ERR_ALREADY_RECORDED = 106;
const ERR_INVALID_STATUS = 107;
const ERR_INVALID_LOCATION = 108;
const ERR_INVALID_SENSOR_DATA = 109;
const ERR_MAX_RECORDS_EXCEEDED = 110;
const ERR_INVALID_UPDATE_PARAM = 111;
const ERR_AUTHORITY_NOT_SET = 112;
const ERR_INVALID_ROLE = 113;
const ERR_RECORD_NOT_FOUND = 114;
const ERR_INVALID_HASH_LENGTH = 115;
const ERR_TIMESTAMP_IN_FUTURE = 117;
const ERR_TIMESTAMP_TOO_OLD = 118;
const ERR_MAX_METADATA_LENGTH = 120;

type Record = {
  recordId: number;
  conditionHash: Uint8Array;
  timestamp: number;
  status: string;
  location: string;
  sensorData: Uint8Array;
  recorder: string;
  verified: boolean;
};

type Metadata = {
  description: string;
  additionalHash: Uint8Array;
};

type Result<T> = {
  ok: boolean;
  value: T | number;
};

class ConditionRecorderMock {
  state: {
    nextRecordId: number;
    maxRecordsPerProduct: number;
    recordingFee: number;
    authorityContract: string | null;
    oraclePrincipal: string | null;
    productConditions: Map<number, Record[]>;
    conditionMetadata: Map<number, Metadata>;
    authorizedRoles: Map<string, string>;
  } = {
    nextRecordId: 0,
    maxRecordsPerProduct: 50,
    recordingFee: 500,
    authorityContract: null,
    oraclePrincipal: null,
    productConditions: new Map(),
    conditionMetadata: new Map(),
    authorizedRoles: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextRecordId: 0,
      maxRecordsPerProduct: 50,
      recordingFee: 500,
      authorityContract: null,
      oraclePrincipal: null,
      productConditions: new Map(),
      conditionMetadata: new Map(),
      authorizedRoles: new Map(),
    };
    this.blockHeight = 100;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.state.authorityContract) {
      if (this.caller !== this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setOraclePrincipal(oracle: string): Result<boolean> {
    if (this.caller !== this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.oraclePrincipal = oracle;
    return { ok: true, value: true };
  }

  grantRole(user: string, role: string): Result<boolean> {
    if (this.caller !== this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!["shipper", "admin", "oracle"].includes(role)) return { ok: false, value: ERR_INVALID_ROLE };
    this.state.authorizedRoles.set(user, role);
    return { ok: true, value: true };
  }

  revokeRole(user: string): Result<boolean> {
    if (this.caller !== this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.authorizedRoles.delete(user);
    return { ok: true, value: true };
  }

  setMaxRecordsPerProduct(newMax: number): Result<boolean> {
    if (this.caller !== this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    this.state.maxRecordsPerProduct = newMax;
    return { ok: true, value: true };
  }

  setRecordingFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newFee < 0) return { ok: false, value: ERR_INVALID_UPDATE_PARAM };
    this.state.recordingFee = newFee;
    return { ok: true, value: true };
  }

  recordCondition(
    productId: number,
    conditionHash: Uint8Array,
    timestamp: number,
    status: string,
    location: string,
    sensorData: Uint8Array,
    metadataDesc: string,
    additionalHash: Uint8Array
  ): Result<number> {
    if (!this.state.authorizedRoles.has(this.caller) || !["shipper", "admin"].includes(this.state.authorizedRoles.get(this.caller)!)) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (productId <= 0) return { ok: false, value: ERR_INVALID_PRODUCT_ID };
    if (conditionHash.length !== 32) return { ok: false, value: ERR_INVALID_HASH_LENGTH };
    if (timestamp < this.blockHeight - 100 || timestamp > this.blockHeight + 10) {
      return { ok: false, value: timestamp > this.blockHeight + 10 ? ERR_TIMESTAMP_IN_FUTURE : ERR_TIMESTAMP_TOO_OLD };
    }
    if (!["pre-shipment", "post-shipment", "in-transit"].includes(status)) return { ok: false, value: ERR_INVALID_STATUS };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (sensorData.length > 128) return { ok: false, value: ERR_INVALID_SENSOR_DATA };
    if (metadataDesc.length > 256) return { ok: false, value: ERR_MAX_METADATA_LENGTH };
    if (additionalHash.length !== 32) return { ok: false, value: ERR_INVALID_HASH_LENGTH };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    const history = this.state.productConditions.get(productId) || [];
    if (history.length >= this.state.maxRecordsPerProduct) return { ok: false, value: ERR_MAX_RECORDS_EXCEEDED };
    const duplicate = history.some(rec => rec.conditionHash.every((v, i) => v === conditionHash[i]));
    if (duplicate) return { ok: false, value: ERR_ALREADY_RECORDED };

    this.stxTransfers.push({ amount: this.state.recordingFee, from: this.caller, to: this.state.authorityContract });

    const recordId = this.state.nextRecordId;
    const newRecord: Record = {
      recordId,
      conditionHash,
      timestamp,
      status,
      location,
      sensorData,
      recorder: this.caller,
      verified: false,
    };
    history.push(newRecord);
    this.state.productConditions.set(productId, history);
    this.state.conditionMetadata.set(recordId, { description: metadataDesc, additionalHash });
    this.state.nextRecordId++;
    return { ok: true, value: recordId };
  }

  getConditionHistory(productId: number): Record[] | null {
    return this.state.productConditions.get(productId) || null;
  }

  verifyCondition(productId: number, recordId: number): Result<boolean> {
    if (this.caller !== this.state.oraclePrincipal) return { ok: false, value: ERR_ORACLE_NOT_VERIFIED };
    const history = this.state.productConditions.get(productId);
    if (!history) return { ok: false, value: ERR_PRODUCT_NOT_FOUND };
    const index = history.findIndex(rec => rec.recordId === recordId);
    if (index === -1) return { ok: false, value: ERR_RECORD_NOT_FOUND };
    history[index].verified = true;
    this.state.productConditions.set(productId, history);
    return { ok: true, value: true };
  }

  getRecordCount(productId: number): Result<number> {
    const history = this.state.productConditions.get(productId) || [];
    return { ok: true, value: history.length };
  }

  isConditionVerified(productId: number, recordId: number): Result<boolean> {
    const history = this.state.productConditions.get(productId);
    if (!history) return { ok: false, value: ERR_PRODUCT_NOT_FOUND };
    const record = history.find(rec => rec.recordId === recordId);
    if (!record) return { ok: false, value: ERR_RECORD_NOT_FOUND };
    return { ok: true, value: record.verified };
  }
}

describe("ConditionRecorder", () => {
  let contract: ConditionRecorderMock;

  beforeEach(() => {
    contract = new ConditionRecorderMock();
    contract.reset();
  });

  it("sets authority contract successfully", () => {
    contract.caller = "ST2AUTH";
    const result = contract.setAuthorityContract("ST2AUTH");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2AUTH");
  });

  it("rejects set authority by unauthorized", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST3FAKE";
    const result = contract.setAuthorityContract("ST4NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("grants role successfully", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.grantRole("ST3USER", "shipper");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorizedRoles.get("ST3USER")).toBe("shipper");
  });

  it("rejects invalid role", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.grantRole("ST3USER", "invalid");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROLE);
  });

  it("records condition successfully", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    contract.grantRole("ST1TEST", "shipper");
    contract.caller = "ST1TEST";
    const hash = new Uint8Array(32).fill(1);
    const sensor = new Uint8Array(10).fill(2);
    const addHash = new Uint8Array(32).fill(3);
    const result = contract.recordCondition(
      1,
      hash,
      105,
      "pre-shipment",
      "Warehouse A",
      sensor,
      "Initial inspection",
      addHash
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const history = contract.getConditionHistory(1);
    expect(history?.length).toBe(1);
    expect(history?.[0].status).toBe("pre-shipment");
    expect(history?.[0].verified).toBe(false);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2AUTH" }]);
  });

  it("rejects recording by unauthorized", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "ST1TEST";
    const hash = new Uint8Array(32).fill(1);
    const sensor = new Uint8Array(10).fill(2);
    const addHash = new Uint8Array(32).fill(3);
    const result = contract.recordCondition(
      1,
      hash,
      105,
      "pre-shipment",
      "Warehouse A",
      sensor,
      "Initial inspection",
      addHash
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects invalid timestamp future", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    contract.grantRole("ST1TEST", "shipper");
    contract.caller = "ST1TEST";
    const hash = new Uint8Array(32).fill(1);
    const sensor = new Uint8Array(10).fill(2);
    const addHash = new Uint8Array(32).fill(3);
    const result = contract.recordCondition(
      1,
      hash,
      120,
      "pre-shipment",
      "Warehouse A",
      sensor,
      "Initial inspection",
      addHash
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TIMESTAMP_IN_FUTURE);
  });

  it("rejects duplicate hash", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    contract.grantRole("ST1TEST", "shipper");
    contract.caller = "ST1TEST";
    const hash = new Uint8Array(32).fill(1);
    const sensor = new Uint8Array(10).fill(2);
    const addHash = new Uint8Array(32).fill(3);
    contract.recordCondition(
      1,
      hash,
      105,
      "pre-shipment",
      "Warehouse A",
      sensor,
      "Initial inspection",
      addHash
    );
    const result = contract.recordCondition(
      1,
      hash,
      106,
      "in-transit",
      "Transit B",
      sensor,
      "Midway check",
      addHash
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_RECORDED);
  });

  it("verifies condition successfully", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    contract.grantRole("ST1TEST", "shipper");
    contract.setOraclePrincipal("ST4ORACLE");
    contract.caller = "ST1TEST";
    const hash = new Uint8Array(32).fill(1);
    const sensor = new Uint8Array(10).fill(2);
    const addHash = new Uint8Array(32).fill(3);
    contract.recordCondition(
      1,
      hash,
      105,
      "pre-shipment",
      "Warehouse A",
      sensor,
      "Initial inspection",
      addHash
    );
    contract.caller = "ST4ORACLE";
    const result = contract.verifyCondition(1, 0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const history = contract.getConditionHistory(1);
    expect(history?.[0].verified).toBe(true);
  });

  it("rejects verify by non-oracle", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    contract.grantRole("ST1TEST", "shipper");
    contract.setOraclePrincipal("ST4ORACLE");
    contract.caller = "ST1TEST";
    const hash = new Uint8Array(32).fill(1);
    const sensor = new Uint8Array(10).fill(2);
    const addHash = new Uint8Array(32).fill(3);
    contract.recordCondition(
      1,
      hash,
      105,
      "pre-shipment",
      "Warehouse A",
      sensor,
      "Initial inspection",
      addHash
    );
    contract.caller = "ST1TEST";
    const result = contract.verifyCondition(1, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_NOT_VERIFIED);
  });

  it("gets record count correctly", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    contract.grantRole("ST1TEST", "shipper");
    contract.caller = "ST1TEST";
    const hash1 = new Uint8Array(32).fill(1);
    const hash2 = new Uint8Array(32).fill(2);
    const sensor = new Uint8Array(10).fill(2);
    const addHash = new Uint8Array(32).fill(3);
    contract.recordCondition(
      1,
      hash1,
      105,
      "pre-shipment",
      "Warehouse A",
      sensor,
      "Initial",
      addHash
    );
    contract.recordCondition(
      1,
      hash2,
      106,
      "post-shipment",
      "Destination C",
      sensor,
      "Final",
      addHash
    );
    const result = contract.getRecordCount(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks if condition verified", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    contract.grantRole("ST1TEST", "shipper");
    contract.setOraclePrincipal("ST4ORACLE");
    contract.caller = "ST1TEST";
    const hash = new Uint8Array(32).fill(1);
    const sensor = new Uint8Array(10).fill(2);
    const addHash = new Uint8Array(32).fill(3);
    contract.recordCondition(
      1,
      hash,
      105,
      "pre-shipment",
      "Warehouse A",
      sensor,
      "Initial inspection",
      addHash
    );
    contract.caller = "ST4ORACLE";
    contract.verifyCondition(1, 0);
    const result = contract.isConditionVerified(1, 0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects max records exceeded", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    contract.grantRole("ST1TEST", "shipper");
    contract.caller = "ST1TEST";
    contract.state.maxRecordsPerProduct = 1;
    const hash1 = new Uint8Array(32).fill(1);
    const hash2 = new Uint8Array(32).fill(2);
    const sensor = new Uint8Array(10).fill(2);
    const addHash = new Uint8Array(32).fill(3);
    contract.recordCondition(
      1,
      hash1,
      105,
      "pre-shipment",
      "Warehouse A",
      sensor,
      "Initial",
      addHash
    );
    const result = contract.recordCondition(
      1,
      hash2,
      106,
      "post-shipment",
      "Destination C",
      sensor,
      "Final",
      addHash
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_RECORDS_EXCEEDED);
  });

  it("revokes role successfully", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    contract.grantRole("ST3USER", "shipper");
    const result = contract.revokeRole("ST3USER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorizedRoles.has("ST3USER")).toBe(false);
  });

  it("sets recording fee successfully", () => {
    contract.caller = "ST2AUTH";
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setRecordingFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.recordingFee).toBe(1000);
  });
});