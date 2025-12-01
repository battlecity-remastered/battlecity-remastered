Feature: Turret placement rules

  Scenario: Turret rounds must not destroy friendly or neutral walls
    Given a defended city with wall sections protecting a factory
    And an allied or neutral turret is actively firing at enemies
    When a turret round collides with a wall tile
    Then the wall tile remains intact and is not damaged by turret fire

  Scenario: Turrets can be placed on factory pickup zones (bottom row)
    Given a player with enough resources to place a turret
    And the player is targeting an open factory pickup zone
    When the player places the turret on the pickup zone
    Then the placement succeeds and the turret begins defending the factory

  Scenario: Turrets can be placed on command centers (bottom row)
    Given a player with enough resources to place a turret
    And the player is targeting a command center footprint
    When the player places the turret on the pickup zone
    Then the placement succeeds and the turret begins defending the factory

  Scenario: Turrets can be placed on hospitals (bottom row)
    Given a player with enough resources to place a turret
    And the player is targeting a hospital footprint
    When the player places the turret on the pickup zone
    Then the placement succeeds and the turret begins defending the factory
