# NegoForge

NegoForge is a web-based multi-agent negotiation platform developed as part of our internship project. The main idea of the project is to simulate negotiation between two agents with different roles, goals, constraints, and personalities.

The user can choose a negotiation scenario and configure the agents before starting the negotiation.

## What does NegoForge do?

In a normal negotiation, each person has their own requirements and limits. NegoForge tries to represent this using agents.

For example, in a vendor negotiation:

- The buyer wants to get the product at a lower price.
- The vendor wants to make a reasonable profit.
- Both agents have their own limits and negotiation style.

The same idea is applied to different scenarios in the system.

## Scenarios

Currently, we have three predefined scenarios.

### 1. Vendor Pricing Negotiation

In this scenario, a customer negotiates with a vendor about the price of a product or service.

**Agent 1:** Buyer / Customer  
**Agent 2:** Vendor / Shopkeeper

The buyer tries to get a better price while the vendor tries to maintain a suitable selling price.

### 2. Job Offer Negotiation

This scenario represents a discussion between a job candidate and an HR representative.

**Agent 1:** Candidate / Job Applicant  
**Agent 2:** HR / Recruiter

The candidate wants a suitable offer, while HR needs to make an offer within the company's budget.

### 3. Project Budget Allocation

In this scenario, project members discuss the allocation of a fixed project budget.

**Agent 1:** Project Manager  
**Agent 2:** Team Lead

The project manager wants to use the available budget effectively, while the team lead wants enough resources for the team.

## Agent Configuration

Before a negotiation starts, each agent can be configured using:

- Agent Name
- Role
- Goal
- Constraints
- Personality

The predefined information changes according to the selected scenario.

### Agent Personalities

The application currently provides three personality options:

**Aggressive**  
The agent strongly focuses on achieving its own target and is less willing to compromise.

**Collaborative**  
The agent tries to reach an agreement that works well for both sides.

**Risk-Averse**  
The agent prefers safer choices and avoids accepting uncertain or unfavorable deals.

## Current Workflow

The current application follows this basic flow:

```text
Select Scenario
      ↓
Load Agents
      ↓
Configure Agents
      ↓
Select Personalities
      ↓
View Goals and Constraints
      ↓
Start Negotiation
