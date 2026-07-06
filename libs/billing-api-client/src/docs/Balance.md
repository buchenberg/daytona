# Balance

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**applicableTo** | [**BalanceApplicableTo**](BalanceApplicableTo.md) |  | [optional] [default to undefined]
**balanceCents** | **number** | BalanceCents is the amount in cents currently available to draw down. | [optional] [default to undefined]
**createdAt** | **string** |  | [optional] [default to undefined]
**expiresAt** | **string** | ExpiresAt is when access to the balance ends. Unset for balances that never expire. | [optional] [default to undefined]
**grantedAmountCents** | **number** | GrantedAmountCents is the total amount in cents originally granted. | [optional] [default to undefined]
**id** | **string** |  | [optional] [default to undefined]
**name** | **string** |  | [optional] [default to undefined]
**type** | [**BalanceType**](BalanceType.md) |  | [optional] [default to undefined]

## Example

```typescript
import { Balance } from './api';

const instance: Balance = {
    applicableTo,
    balanceCents,
    createdAt,
    expiresAt,
    grantedAmountCents,
    id,
    name,
    type,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
