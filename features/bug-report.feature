Feature: Reported gameplay regressions
  # These scenarios codify the latest live regressions so we can wire up integration coverage later.

  @bug-report
  Scenario: Factory pickups cannot be duplicated while production is active
    Given a factory is actively producing an item
    And a player waits for the item to spawn on the pickup zone
    When the player collects the item during production
    Then the inventory reflects a single item and additional duplicates are not created

  @bug-report
  Scenario: AI cities rebuild gradually after being orbed
    Given an AI city has been destroyed by an orb
    When the AI city begins to rebuild
    Then structures respawn on their production timers instead of instantly blocking the player in

  @bug-report
