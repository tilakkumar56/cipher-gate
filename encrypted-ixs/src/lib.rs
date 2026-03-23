use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    pub struct AccessInput {
        requester_id: u128,
        resource_id: u128,
        allowed_user: u128,
        expiry_time: u128,
        current_time: u128,
    }

    pub struct AccessResult {
        granted: u8,
        key_fragment: u128,
    }

    #[instruction]
    pub fn check_access(input: Enc<Shared, AccessInput>) -> Enc<Shared, AccessResult> {
        let d = input.to_arcis();
        let user_match = d.requester_id == d.allowed_user;
        let not_expired = d.current_time < d.expiry_time;
        let resource_valid = d.resource_id != 0;
        let all_pass = user_match && not_expired && resource_valid;
        let granted: u8 = if all_pass { 1 } else { 0 };
        let key_fragment: u128 = if all_pass {
            d.requester_id + d.resource_id + d.expiry_time
        } else {
            0
        };
        let result = AccessResult { granted, key_fragment };
        input.owner.from_arcis(result)
    }
}
