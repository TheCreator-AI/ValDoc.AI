import { type ErrorObject, type ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import ursV1 from "../../../schemas/urs.v1.json";
import raV1 from "../../../schemas/ra.v1.json";
import ioqV1 from "../../../schemas/ioq.v1.json";
import oqV1 from "../../../schemas/oq.v1.json";
import tmV1 from "../../../schemas/tm.v1.json";

export type ValidationSchemaName = "urs.v1" | "ra.v1" | "ioq.v1" | "oq.v1" | "tm.v1";

const schemaMap: Record<ValidationSchemaName, object> = {
  "urs.v1": ursV1,
  "ra.v1": raV1,
  "ioq.v1": ioqV1,
  "oq.v1": oqV1,
  "tm.v1": tmV1
};

const ajv = new Ajv2020({
  allErrors: true,
  strict: true
});
addFormats(ajv);

const validators = new Map<ValidationSchemaName, ValidateFunction>();

const toMessage = (error: ErrorObject) => {
  const path = error.instancePath || "/";
  return `${path} ${error.message ?? "invalid value"}`.trim();
};

const getValidator = (schemaName: ValidationSchemaName) => {
  const cached = validators.get(schemaName);
  if (cached) return cached;

  const schema = schemaMap[schemaName];
  const validator = ajv.compile(schema);
  validators.set(schemaName, validator);
  return validator;
};

export const validateDocumentPayload = (schemaName: ValidationSchemaName, payload: unknown) => {
  const validator = getValidator(schemaName);
  const valid = validator(payload);
  return {
    valid: Boolean(valid),
    errors: valid ? [] : (validator.errors ?? []).map(toMessage)
  };
};

export const listValidationSchemas = (): ValidationSchemaName[] => {
  return Object.keys(schemaMap) as ValidationSchemaName[];
};
