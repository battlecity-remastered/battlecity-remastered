Feature: Reported gameplay regressions
  # These scenarios codify the latest live regressions so we can wire up integration coverage later.

  @bug-report @pending
  Scenario: Turret rounds must not destroy friendly or neutral walls
    Given a defended city with wall sections protecting a factory
    And an allied or neutral turret is actively firing at enemies
    When a turret round collides with a wall tile
    Then the wall tile remains intact and is not damaged by turret fire

  @bug-report @pending
  Scenario: Turrets can be placed on factory pickup zones
    Given a player with enough resources to place a turret
    And the player is targeting an open factory pickup zone
    When the player places the turret on the pickup zone
    Then the placement succeeds and the turret begins defending the factory

  @bug-report @pending
  Scenario: Factory pickups cannot be duplicated while production is active
    Given a factory is actively producing an item
    And a player waits for the item to spawn on the pickup zone
    When the player collects the item during production
    Then the inventory reflects a single item and additional duplicates are not created

  @bug-report @pending
  Scenario: AI cities rebuild gradually after being orbed
    Given an AI city has been destroyed by an orb
    When the AI city begins to rebuild
    Then structures respawn on their production timers instead of instantly blocking the player in

  @bug-report @pending
  Scenario: Medkits always heal when consumed
    Given a player is below maximum health
    And the player has a medkit in their inventory
    When the player consumes the medkit
    Then the player regains the expected health every time and the medkit does not disappear without healing
