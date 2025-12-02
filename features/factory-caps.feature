@factory-caps
Feature: Factory and player caps match legacy limits
  Background:
    Given the BattleCity server is running
    And a connected player in city 0

  Scenario Outline: Factory production and player pickup respect caps for <item>
    Given a <item> factory exists in city 0
    When the player collects all available <itemPlural> from the factory
    Then the player inventory for <item> is capped at <playerCap>
    And the remaining factory stock for <item> is <remainingFactoryStock>

  Examples:
    | item    | itemPlural | playerCap | factoryCap | remainingFactoryStock |
    | turret  | turrets    | 10        | 10         | 0                     |
    | medkit  | medkits    | 5         | 20         | 15                    |
    | bomb    | bombs      | 20        | 20         | 0                     |
    | cloak   | cloaks     | 4         | 4          | 0                     |

  Scenario: Destroyed defenses return stock to the factory
    Given a turret factory exists in city 0
    And a placed turret defense for city 0
    And the turret factory stock is 0
    When that defense is destroyed
    Then the turret factory stock increases by 1

  Scenario: Destroying placed turrets restores factory stock to cap
    Given a turret factory exists in city 0
    When a player collects all available items from the factory
    Then the player places all the items
    And the player shoots an item to destroy it
    Then the factory count should increment by one
    When all items are destroyed
    Then the factory count should equal the factory cap
