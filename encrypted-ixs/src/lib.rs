use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    const MAX_OPTIONS: usize = 8;

    pub struct Ballot {
        option_idx: u8,
        weight: u128,
    }

    pub struct TallyState {
        counts: [u128; MAX_OPTIONS],
        total_votes: u128,
    }

    #[instruction]
    pub fn cast_and_tally(
        ballot: Enc<Shared, Ballot>,
        current_tally: Enc<Shared, TallyState>,
    ) -> Enc<Shared, TallyState> {
        let b = ballot.to_arcis();
        let t = current_tally.to_arcis();

        let mut new_counts = t.counts;
        let new_total = t.total_votes + b.weight;

        for i in 0..MAX_OPTIONS {
            let is_selected = b.option_idx == (i as u8);
            if is_selected {
                new_counts[i] = new_counts[i] + b.weight;
            }
        }

        let result = TallyState {
            counts: new_counts,
            total_votes: new_total,
        };

        current_tally.owner.from_arcis(result)
    }
}
