Feature: Medkit consumption

  @requires-further-investigation
  Scenario: Medkits always heal when consumed
    Given a player is below maximum health
    And the player has a medkit in their inventory
    When the player consumes the medkit
    Then the player regains the expected health every time and the medkit does not disappear without healing
