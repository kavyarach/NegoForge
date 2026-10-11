import {
  describe,
  it,
  expect,
} from 'vitest';

import { scenarios } from '../constants/scenarios';

import {
  NEGOTIATION_STATUS,
  NEGOTIATION_MODE,
} from '../constants/negotiationConstants';

import { NegotiationApi } from '../services/NegotiationApi';


const personalities = [
  'Aggressive',
  'Collaborative',
  'Risk-Averse',
];


const createAgentConfigs = (
  agent1,
  agent2,
  personality1 = 'Aggressive',
  personality2 = 'Collaborative'
) => ({
  [agent1]: personality1,
  [agent2]: personality2,
});


const completeSimulation = (
  scenario,
  agentConfigs
) => {
  const state =
    NegotiationApi.createNegotiation(
      scenario,
      agentConfigs,
      NEGOTIATION_MODE.SIMULATION
    );

  let current = state;
  let iterations = 0;

  while (
    current.negotiationStatus ===
      NEGOTIATION_STATUS.IN_PROGRESS &&
    iterations < 15
  ) {
    current =
      NegotiationApi.executeTurn(
        state.negotiationId
      );

    iterations++;
  }

  return current;
};


describe(
  'Milestone 4 - Outcome Screen and Reporting',
  () => {

    // ---------------------------------------------------------
    // 1. OUTCOME REPORT
    // ---------------------------------------------------------

    it(
      'generates complete outcome metrics',
      () => {
        const scenario = scenarios.vendor;

        const agentConfigs =
          createAgentConfigs(
            'Buyer',
            'Vendor'
          );

        const state =
          NegotiationApi.createNegotiation(
            scenario,
            agentConfigs,
            NEGOTIATION_MODE.SIMULATION
          );

        const report =
          NegotiationApi.getOutcomeReport(
            state.negotiationId
          );

        expect(report).toBeTruthy();

        expect(report).toHaveProperty(
          'scenarioTitle'
        );

        expect(report).toHaveProperty(
          'agreementTerm'
        );

        expect(report).toHaveProperty(
          'roundsTaken'
        );

        expect(report).toHaveProperty(
          'concessionTimeline'
        );

        expect(report).toHaveProperty(
          'transcript'
        );

        expect(report).toHaveProperty(
          'agent1Metrics'
        );

        expect(report).toHaveProperty(
          'agent2Metrics'
        );

        expect(
          report.agent1Metrics
        ).toHaveProperty(
          'objectiveSatisfaction'
        );

        expect(
          report.agent2Metrics
        ).toHaveProperty(
          'objectiveSatisfaction'
        );
      }
    );


    // ---------------------------------------------------------
    // 2. TRANSCRIPT
    // ---------------------------------------------------------

    it(
      'records negotiation transcript',
      () => {
        const state =
          NegotiationApi.createNegotiation(
            scenarios.vendor,
            createAgentConfigs(
              'Buyer',
              'Vendor'
            ),
            NEGOTIATION_MODE.SIMULATION
          );

        NegotiationApi.executeTurn(
          state.negotiationId
        );

        const report =
          NegotiationApi.getOutcomeReport(
            state.negotiationId
          );

        expect(
          report.transcript.length
        ).toBeGreaterThan(0);
      }
    );


    // ---------------------------------------------------------
    // 3. CONCESSION TIMELINE
    // ---------------------------------------------------------

    it(
      'contains concession timeline data',
      () => {
        const state =
          NegotiationApi.createNegotiation(
            scenarios.vendor,
            createAgentConfigs(
              'Buyer',
              'Vendor'
            ),
            NEGOTIATION_MODE.SIMULATION
          );

        NegotiationApi.executeTurn(
          state.negotiationId
        );

        NegotiationApi.executeTurn(
          state.negotiationId
        );

        const report =
          NegotiationApi.getOutcomeReport(
            state.negotiationId
          );

        expect(
          Array.isArray(
            report.concessionTimeline
          )
        ).toBe(true);
      }
    );


    // ---------------------------------------------------------
    // 4. ALL THREE SCENARIOS
    // ---------------------------------------------------------

    it(
      'supports all three milestone scenarios',
      () => {
        const scenarioList = [
          {
            scenario: scenarios.vendor,
            agents: ['Buyer', 'Vendor'],
          },
          {
            scenario: scenarios.job,
            agents: ['Candidate', 'HR'],
          },
          {
            scenario: scenarios.budget,
            agents: [
              'Project Manager',
              'Team Lead',
            ],
          },
        ];

        scenarioList.forEach(
          ({
            scenario,
            agents,
          }) => {
            const state =
              NegotiationApi.createNegotiation(
                scenario,
                createAgentConfigs(
                  agents[0],
                  agents[1]
                ),
                NEGOTIATION_MODE.SIMULATION
              );

            const report =
              NegotiationApi.getOutcomeReport(
                state.negotiationId
              );

            expect(
              report.scenarioTitle
            ).toBe(scenario.title);

            expect(
              report.agent1Metrics
            ).toBeTruthy();

            expect(
              report.agent2Metrics
            ).toBeTruthy();
          }
        );
      }
    );


    // ---------------------------------------------------------
    // 5. END-TO-END AI VS AI
    // ---------------------------------------------------------

    it(
      'completes AI vs AI negotiation',
      () => {
        const current =
          completeSimulation(
            scenarios.vendor,
            createAgentConfigs(
              'Buyer',
              'Vendor'
            )
          );

        expect([
          NEGOTIATION_STATUS.AGREEMENT,
          NEGOTIATION_STATUS.DEADLOCK,
          NEGOTIATION_STATUS.REJECTED,
        ]).toContain(
          current.negotiationStatus
        );

        expect(
          current.currentRound
        ).toBeGreaterThan(0);
      }
    );


    // ---------------------------------------------------------
    // 6. PRACTICE MODE
    // ---------------------------------------------------------

    it(
      'supports Human vs AI Practice Mode',
      () => {
        const scenario =
          scenarios.vendor;

        const agentConfigs =
          createAgentConfigs(
            'Buyer',
            'Vendor',
            'Collaborative',
            'Aggressive'
          );

        const state =
          NegotiationApi.createNegotiation(
            scenario,
            agentConfigs,
            NEGOTIATION_MODE.PRACTICE,
            'Buyer'
          );

        expect(
          state.mode
        ).toBe(
          NEGOTIATION_MODE.PRACTICE
        );

        expect(
          state.humanAgentId
        ).toBe('Buyer');

        // Human submits an opening offer.
        const afterHumanOffer =
          NegotiationApi.submitOffer(
            state.negotiationId,
            {
              agentId: 'Buyer',
              value: 95000,
              terms: 'Human buyer opening offer',
              reason: 'Trying to stay within budget.',
            }
          );

        expect(
          afterHumanOffer.negotiationHistory.length
        ).toBeGreaterThan(0);

        // AI responds to the human offer.
        const afterAiTurn =
          NegotiationApi.executeTurn(
            state.negotiationId
          );

        expect(
          afterAiTurn.negotiationHistory.length
        ).toBeGreaterThan(1);
      }
    );


    // ---------------------------------------------------------
    // 7. PERSONALITY COMBINATIONS
    // ---------------------------------------------------------

    it(
      'supports all personality combinations',
      () => {
        const scenario =
          scenarios.vendor;

        const combinations =
          personalities.flatMap(
            (personality1) =>
              personalities.map(
                (personality2) => [
                  personality1,
                  personality2,
                ]
              )
          );

        combinations.forEach(
          ([
            personality1,
            personality2,
          ]) => {
            const state =
              NegotiationApi.createNegotiation(
                scenario,
                createAgentConfigs(
                  'Buyer',
                  'Vendor',
                  personality1,
                  personality2
                ),
                NEGOTIATION_MODE.SIMULATION
              );

            expect(
              state.agentPersonality.Buyer
            ).toBe(personality1);

            expect(
              state.agentPersonality.Vendor
            ).toBe(personality2);
          }
        );
      }
    );


    // ---------------------------------------------------------
    // 8. ALL SCENARIOS + PERSONALITIES
    // ---------------------------------------------------------

    it(
      'validates personality combinations across all scenarios',
      () => {
        const scenarioList = [
          {
            scenario: scenarios.vendor,
            agents: ['Buyer', 'Vendor'],
          },
          {
            scenario: scenarios.job,
            agents: ['Candidate', 'HR'],
          },
          {
            scenario: scenarios.budget,
            agents: [
              'Project Manager',
              'Team Lead',
            ],
          },
        ];

        scenarioList.forEach(
          ({
            scenario,
            agents,
          }) => {
            personalities.forEach(
              (personality1) => {
                personalities.forEach(
                  (personality2) => {
                    const state =
                      NegotiationApi.createNegotiation(
                        scenario,
                        createAgentConfigs(
                          agents[0],
                          agents[1],
                          personality1,
                          personality2
                        ),
                        NEGOTIATION_MODE.SIMULATION
                      );

                    expect(
                      state.agentPersonality[
                        agents[0]
                      ]
                    ).toBe(personality1);

                    expect(
                      state.agentPersonality[
                        agents[1]
                      ]
                    ).toBe(personality2);
                  }
                );
              }
            );
          }
        );
      }
    );


    // ---------------------------------------------------------
    // 9. FINAL STATUS
    // ---------------------------------------------------------

    it(
      'preserves valid negotiation status',
      () => {
        const current =
          completeSimulation(
            scenarios.vendor,
            createAgentConfigs(
              'Buyer',
              'Vendor'
            )
          );

        expect([
          NEGOTIATION_STATUS.AGREEMENT,
          NEGOTIATION_STATUS.DEADLOCK,
          NEGOTIATION_STATUS.REJECTED,
        ]).toContain(
          current.negotiationStatus
        );

        const report =
          NegotiationApi.getOutcomeReport(
            current.negotiationId
          );

        expect(report).toBeTruthy();

        expect(
          report.roundsTaken
        ).toBeGreaterThan(0);
      }
    );

  }
);