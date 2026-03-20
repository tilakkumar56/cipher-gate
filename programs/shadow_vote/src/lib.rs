use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

const COMP_DEF_OFFSET_CAST_AND_TALLY: u32 = comp_def_offset("cast_and_tally");
const MAX_OPTIONS: usize = 8;

declare_id!("H6NrSVGXBpp5jdrEAaLHuWLsmPUhMt9yK2uujQotNmKU");

#[arcium_program]
pub mod shadow_vote {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.program_state;
        state.authority = ctx.accounts.authority.key();
        state.total_proposals = 0;
        Ok(())
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description: String,
        num_options: u8,
        option_labels: Vec<String>,
        voting_ends_at: i64,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        proposal.creator = ctx.accounts.authority.key();
        proposal.title = title;
        proposal.description = description;
        proposal.num_options = num_options;
        proposal.option_labels = option_labels;
        proposal.voting_ends_at = voting_ends_at;
        proposal.total_votes = 0;
        proposal.finalized = false;
        proposal.results = [0u64; MAX_OPTIONS];
        proposal.bump = ctx.bumps.proposal;
        let state = &mut ctx.accounts.program_state;
        state.total_proposals += 1;
        proposal.proposal_id = state.total_proposals;
        Ok(())
    }

    pub fn init_cast_and_tally_comp_def(ctx: Context<InitCastAndTallyCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn cast_vote(
        ctx: Context<CastVote>,
        computation_offset: u64,
        ct_option_idx: [u8; 32],
        ct_weight: [u8; 32],
        pub_key_ballot: [u8; 32],
        nonce_ballot: u128,
        ct_counts: [[u8; 32]; MAX_OPTIONS],
        ct_total: [u8; 32],
        pub_key_tally: [u8; 32],
        nonce_tally: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let mut builder = ArgBuilder::new()
            .x25519_pubkey(pub_key_ballot)
            .plaintext_u128(nonce_ballot)
            .encrypted_u8(ct_option_idx)
            .encrypted_u128(ct_weight);

        builder = builder
            .x25519_pubkey(pub_key_tally)
            .plaintext_u128(nonce_tally);
        for i in 0..MAX_OPTIONS {
            builder = builder.encrypted_u128(ct_counts[i]);
        }
        builder = builder.encrypted_u128(ct_total);
        let args = builder.build();

        let vote_record_pda = ctx.accounts.vote_record.key();
        let proposal_pda = ctx.accounts.proposal.key();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![CastAndTallyCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[
                    CallbackAccount { pubkey: vote_record_pda, is_writable: true },
                    CallbackAccount { pubkey: proposal_pda, is_writable: true },
                ],
            )?],
            1,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "cast_and_tally")]
    pub fn cast_and_tally_callback(
        ctx: Context<CastAndTallyCallback>,
        output: SignedComputationOutputs<CastAndTallyOutput>,
    ) -> Result<()> {
        let _o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(CastAndTallyOutput { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };
        let record = &mut ctx.accounts.vote_record;
        record.counted = true;
        let proposal = &mut ctx.accounts.proposal;
        proposal.total_votes += 1;
        emit!(VoteCastEvent {
            proposal_id: proposal.proposal_id,
            total_votes: proposal.total_votes,
        });
        Ok(())
    }

    pub fn finalize_proposal(ctx: Context<FinalizeProposal>, results: [u64; MAX_OPTIONS]) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        proposal.finalized = true;
        proposal.results = results;
        emit!(ProposalFinalizedEvent {
            proposal_id: proposal.proposal_id,
            results,
            total_votes: proposal.total_votes,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + ProgramState::INIT_SPACE, seeds = [b"program_state"], bump)]
    pub program_state: Account<'info, ProgramState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(title: String, description: String, num_options: u8, option_labels: Vec<String>, voting_ends_at: i64)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Proposal::INIT_SPACE, seeds = [b"proposal", authority.key().as_ref(), &(program_state.total_proposals + 1).to_le_bytes()], bump)]
    pub proposal: Account<'info, Proposal>,
    #[account(mut, seeds = [b"program_state"], bump)]
    pub program_state: Account<'info, ProgramState>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("cast_and_tally", payer)]
#[derive(Accounts)]
pub struct InitCastAndTallyCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("cast_and_tally", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init_if_needed, space = 9, payer = payer, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CAST_AND_TALLY))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    #[account(init, payer = payer, space = 8 + VoteRecord::INIT_SPACE, seeds = [b"vote_record", computation_offset.to_le_bytes().as_ref()], bump)]
    pub vote_record: Account<'info, VoteRecord>,
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("cast_and_tally")]
#[derive(Accounts)]
pub struct CastAndTallyCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CAST_AND_TALLY))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub vote_record: Account<'info, VoteRecord>,
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
}

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, constraint = proposal.creator == authority.key())]
    pub proposal: Account<'info, Proposal>,
}

#[account]
#[derive(InitSpace)]
pub struct ProgramState {
    pub authority: Pubkey,
    pub total_proposals: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub creator: Pubkey,
    pub proposal_id: u64,
    #[max_len(64)]
    pub title: String,
    #[max_len(256)]
    pub description: String,
    pub num_options: u8,
    #[max_len(8, 32)]
    pub option_labels: Vec<String>,
    pub voting_ends_at: i64,
    pub total_votes: u64,
    pub finalized: bool,
    pub results: [u64; 8],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub voter: Pubkey,
    pub proposal_id: u64,
    pub counted: bool,
    pub timestamp: i64,
}

#[event]
pub struct VoteCastEvent {
    pub proposal_id: u64,
    pub total_votes: u64,
}

#[event]
pub struct ProposalFinalizedEvent {
    pub proposal_id: u64,
    pub results: [u64; 8],
    pub total_votes: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
}
